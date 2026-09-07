/* ============================================================
   tools.js — tool list, add/edit, quantity change history
   ============================================================ */

let CURRENT_USER = null;
let SELECTED_TOOL = null;

const TOOL_TYPE_LABELS = {
  initial: 'موجودی اولیه',
  added: 'اضافه شده',
  lost: 'گم شده',
  broken: 'خراب شده',
  removed: 'حذف شده',
  adjustment: 'اصلاح موجودی'
};

async function initTools() {
  const session = await Utils.requireSession();
  if (!session) return;
  CURRENT_USER = session.user;
  await loadTools();
}

async function loadTools() {
  const box = document.getElementById('tools-list');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const { data, error } = await sb
    .from('tools')
    .select('id, name, unit, current_quantity, min_quantity, active')
    .order('active', { ascending: false })
    .order('name');

  if (error) { box.innerHTML = `<div class="alert-fa error">${Utils.friendlyError(error)}</div>`; return; }

  if (!data.length) {
    box.innerHTML = `<div class="empty-state">هنوز ابزاری ثبت نشده. با دکمه «+ افزودن ابزار» شروع کنید.</div>`;
    return;
  }

  box.innerHTML = data.map(t => {
    const low = t.active && (t.current_quantity <= t.min_quantity);
    return `
    <div class="card-flat ${low || !t.active ? 'danger' : ''}" style="cursor:pointer;" onclick="openToolDetail('${t.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;">${low ? '<span class="warn-badge">⚠️</span>' : ''}${t.name}</div>
          ${!t.active ? '<span class="pill off">غیرفعال</span>' : ''}
        </div>
        <div class="qty" style="font-weight:800;font-size:1.2rem;">${Utils.fmtQty(t.current_quantity, t.unit)}</div>
      </div>
    </div>`;
  }).join('');
}

function openAddToolSheet() {
  SELECTED_TOOL = null;
  document.getElementById('tool-detail-mode').style.display = 'none';
  document.getElementById('tool-add-mode').style.display = 'block';
  document.getElementById('tool-sheet-title').textContent = 'افزودن ابزار جدید';
  document.getElementById('t-name').value = '';
  document.getElementById('t-unit').value = 'عدد';
  document.getElementById('t-initial').value = '0';
  document.getElementById('t-min').value = '0';
  document.getElementById('t-notes').value = '';
  Utils.openSheet('sheet-tool-edit');
}

async function submitNewTool(e) {
  e.preventDefault();
  const name = document.getElementById('t-name').value.trim();
  const unit = document.getElementById('t-unit').value.trim() || 'عدد';
  const initial = Utils.parsePositiveNumber(document.getElementById('t-initial').value) ?? 0;
  const min = Utils.parsePositiveNumber(document.getElementById('t-min').value) ?? 0;
  const notes = document.getElementById('t-notes').value.trim();

  if (!name) { Utils.showToast('لطفاً نام ابزار را وارد کنید.'); return; }

  const { data: tool, error } = await sb.from('tools').insert({
    owner_id: CURRENT_USER.id, name, unit, min_quantity: min, notes: notes || null
  }).select().single();

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  if (initial > 0) {
    await sb.from('tool_transactions').insert({
      owner_id: CURRENT_USER.id, tool_id: tool.id, work_date: Jalali.todayISO(),
      type: 'initial', quantity_change: initial
    });
  }

  Utils.closeSheet('sheet-tool-edit');
  Utils.showToast('ابزار جدید اضافه شد.');
  loadTools();
}

async function openToolDetail(id) {
  const { data: t, error } = await sb.from('tools').select('*').eq('id', id).single();
  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  SELECTED_TOOL = t;

  document.getElementById('tool-add-mode').style.display = 'none';
  document.getElementById('tool-detail-mode').style.display = 'block';
  document.getElementById('tool-sheet-title').textContent = t.name;

  document.getElementById('td-current').textContent = Utils.fmtQty(t.current_quantity, t.unit);
  document.getElementById('td-edit-name').value = t.name;
  document.getElementById('td-edit-unit').value = t.unit;
  document.getElementById('td-edit-min').value = t.min_quantity;
  document.getElementById('td-edit-notes').value = t.notes || '';
  document.getElementById('td-edit-active').checked = t.active;
  document.getElementById('td-adj-type').value = 'added';
  document.getElementById('td-adj-qty').value = '';

  await loadToolHistory(id);
  Utils.openSheet('sheet-tool-edit');
}

async function loadToolHistory(toolId) {
  const box = document.getElementById('td-history');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const { data, error } = await sb
    .from('tool_transactions')
    .select('id, work_date, type, quantity_change, note, created_at')
    .eq('tool_id', toolId)
    .order('work_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) { box.innerHTML = `<div class="alert-fa error">${Utils.friendlyError(error)}</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="empty-state">تراکنشی ثبت نشده</div>`; return; }

  let running = 0;
  const rows = data.map(t => {
    running = Math.round((running + t.quantity_change) * 100) / 100;
    const positive = t.quantity_change >= 0;
    return `<div class="hist-row">
      <span>${Jalali.formatShortFromISO(t.work_date)}<br><span class="type-tag">${TOOL_TYPE_LABELS[t.type] || t.type}${t.note ? ' — ' + t.note : ''}</span></span>
      <span class="amt ${positive ? 'pos' : 'neg'}">${positive ? '+' : ''}${Utils.fmtQty(t.quantity_change, '')}</span>
      <span class="bal">${Utils.fmtQty(running, '')}</span>
    </div>`;
  }).reverse();

  box.innerHTML = rows.join('');
}

async function submitToolAdjustment(e) {
  e.preventDefault();
  if (!SELECTED_TOOL) return;

  const type = document.getElementById('td-adj-type').value;
  const rawQty = Utils.parsePositiveNumber(document.getElementById('td-adj-qty').value);
  if (rawQty === null || rawQty <= 0) { Utils.showToast('لطفاً مقدار را وارد کنید.'); return; }

  const negativeTypes = ['lost', 'broken', 'removed'];
  const quantity_change = negativeTypes.includes(type) ? -rawQty : rawQty;

  const { error } = await sb.from('tool_transactions').insert({
    owner_id: CURRENT_USER.id, tool_id: SELECTED_TOOL.id, work_date: Jalali.todayISO(),
    type, quantity_change
  });

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  document.getElementById('td-adj-qty').value = '';
  Utils.showToast('ثبت شد.');
  const { data: t } = await sb.from('tools').select('*').eq('id', SELECTED_TOOL.id).single();
  SELECTED_TOOL = t;
  document.getElementById('td-current').textContent = Utils.fmtQty(t.current_quantity, t.unit);
  loadToolHistory(t.id);
  loadTools();
}

async function submitEditTool(e) {
  e.preventDefault();
  if (!SELECTED_TOOL) return;

  const name = document.getElementById('td-edit-name').value.trim();
  const unit = document.getElementById('td-edit-unit').value.trim();
  const min = Utils.parsePositiveNumber(document.getElementById('td-edit-min').value) ?? 0;
  const notes = document.getElementById('td-edit-notes').value.trim();
  const active = document.getElementById('td-edit-active').checked;

  if (!name || !unit) { Utils.showToast('لطفاً نام و واحد را وارد کنید.'); return; }

  const { error } = await sb.from('tools').update({
    name, unit, min_quantity: min, notes: notes || null, active, updated_at: new Date().toISOString()
  }).eq('id', SELECTED_TOOL.id);

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  Utils.showToast('تغییرات ذخیره شد.');
  Utils.closeSheet('sheet-tool-edit');
  loadTools();
}

document.addEventListener('DOMContentLoaded', initTools);
