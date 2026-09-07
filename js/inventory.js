/* ============================================================
   inventory.js — materials list, detail + history, transactions
   ============================================================ */

let CURRENT_USER = null;
let SELECTED_MATERIAL = null;

const TYPE_LABELS = {
  initial: 'موجودی اولیه',
  purchase: 'خرید / ورود',
  consumption: 'مصرف',
  adjustment: 'اصلاح موجودی'
};

async function initInventory() {
  const session = await Utils.requireSession();
  if (!session) return;
  CURRENT_USER = session.user;
  await loadMaterials();
}

async function loadMaterials() {
  const box = document.getElementById('materials-list');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const { data, error } = await sb
    .from('materials')
    .select('id, name, unit, current_quantity, min_quantity, active')
    .order('active', { ascending: false })
    .order('name');

  if (error) { box.innerHTML = `<div class="alert-fa error">${Utils.friendlyError(error)}</div>`; return; }

  if (!data.length) {
    box.innerHTML = `<div class="empty-state">هنوز کالایی ثبت نشده. با دکمه «+ افزودن کالا» شروع کنید.</div>`;
    return;
  }

  box.innerHTML = data.map(m => {
    const low = m.active && (m.current_quantity <= m.min_quantity);
    return `
    <div class="card-flat ${low ? 'danger' : ''} ${!m.active ? 'danger' : ''}" style="cursor:pointer;" onclick="openMaterialDetail('${m.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;">${low ? '<span class="warn-badge">⚠️</span>' : ''}${m.name}</div>
          ${!m.active ? '<span class="pill off">غیرفعال</span>' : ''}
        </div>
        <div class="qty" style="font-weight:800;font-size:1.2rem;">${Utils.fmtQty(m.current_quantity, m.unit)}</div>
      </div>
    </div>`;
  }).join('');
}

function openAddMaterialSheet() {
  SELECTED_MATERIAL = null;
  document.getElementById('mat-detail-mode').style.display = 'none';
  document.getElementById('mat-add-mode').style.display = 'block';
  document.getElementById('material-sheet-title').textContent = 'افزودن کالای جدید';
  document.getElementById('m-name').value = '';
  document.getElementById('m-unit').value = '';
  document.getElementById('m-initial').value = '0';
  document.getElementById('m-min').value = '0';
  document.getElementById('m-notes').value = '';
  Utils.openSheet('sheet-material-edit');
}

async function submitNewMaterial(e) {
  e.preventDefault();
  const name = document.getElementById('m-name').value.trim();
  const unit = document.getElementById('m-unit').value.trim();
  const initial = Utils.parsePositiveNumber(document.getElementById('m-initial').value) ?? 0;
  const min = Utils.parsePositiveNumber(document.getElementById('m-min').value) ?? 0;
  const notes = document.getElementById('m-notes').value.trim();

  if (!name || !unit) { Utils.showToast('لطفاً نام و واحد را وارد کنید.'); return; }

  const { data: mat, error } = await sb.from('materials').insert({
    owner_id: CURRENT_USER.id, name, unit, min_quantity: min, notes: notes || null
  }).select().single();

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  if (initial > 0) {
    await sb.from('inventory_transactions').insert({
      owner_id: CURRENT_USER.id, material_id: mat.id, work_date: Jalali.todayISO(),
      type: 'initial', quantity_change: initial
    });
  }

  Utils.closeSheet('sheet-material-edit');
  Utils.showToast('کالای جدید اضافه شد.');
  loadMaterials();
}

// ---------- material detail (edit + history) ----------
async function openMaterialDetail(id) {
  const { data: m, error } = await sb.from('materials').select('*').eq('id', id).single();
  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  SELECTED_MATERIAL = m;

  document.getElementById('mat-add-mode').style.display = 'none';
  document.getElementById('mat-detail-mode').style.display = 'block';
  document.getElementById('material-sheet-title').textContent = m.name;

  document.getElementById('md-current').textContent = Utils.fmtQty(m.current_quantity, m.unit);
  document.getElementById('md-edit-name').value = m.name;
  document.getElementById('md-edit-unit').value = m.unit;
  document.getElementById('md-edit-min').value = m.min_quantity;
  document.getElementById('md-edit-notes').value = m.notes || '';
  document.getElementById('md-edit-active').checked = m.active;

  await loadMaterialHistory(id);
  Utils.openSheet('sheet-material-edit');
}

async function loadMaterialHistory(materialId) {
  const box = document.getElementById('md-history');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const { data, error } = await sb
    .from('inventory_transactions')
    .select('id, work_date, type, quantity_change, note, created_at')
    .eq('material_id', materialId)
    .order('work_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) { box.innerHTML = `<div class="alert-fa error">${Utils.friendlyError(error)}</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="empty-state">تراکنشی ثبت نشده</div>`; return; }

  let running = 0;
  const rows = data.map(t => {
    running = Math.round((running + t.quantity_change) * 100) / 100;
    const positive = t.quantity_change >= 0;
    return `<div class="hist-row">
      <span>${Jalali.formatShortFromISO(t.work_date)}<br><span class="type-tag">${TYPE_LABELS[t.type] || t.type}${t.note ? ' — ' + t.note : ''}</span></span>
      <span class="amt ${positive ? 'pos' : 'neg'}">${positive ? '+' : ''}${Utils.fmtQty(t.quantity_change, '')}</span>
      <span class="bal">${Utils.fmtQty(running, '')}</span>
    </div>`;
  }).reverse(); // most recent first

  box.innerHTML = rows.join('');
}

async function submitEditMaterial(e) {
  e.preventDefault();
  if (!SELECTED_MATERIAL) return;

  const name = document.getElementById('md-edit-name').value.trim();
  const unit = document.getElementById('md-edit-unit').value.trim();
  const min = Utils.parsePositiveNumber(document.getElementById('md-edit-min').value) ?? 0;
  const notes = document.getElementById('md-edit-notes').value.trim();
  const active = document.getElementById('md-edit-active').checked;

  if (!name || !unit) { Utils.showToast('لطفاً نام و واحد را وارد کنید.'); return; }

  const { error } = await sb.from('materials').update({
    name, unit, min_quantity: min, notes: notes || null, active, updated_at: new Date().toISOString()
  }).eq('id', SELECTED_MATERIAL.id);

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  Utils.showToast('تغییرات ذخیره شد.');
  Utils.closeSheet('sheet-material-edit');
  loadMaterials();
}

document.addEventListener('DOMContentLoaded', initInventory);
