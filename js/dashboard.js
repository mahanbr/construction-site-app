/* ============================================================
   dashboard.js — home screen: today's snapshot + quick actions
   ============================================================ */

let CURRENT_USER = null;
const TODAY_ISO = Jalali.todayISO();

async function initDashboard() {
  const session = await Utils.requireSession();
  if (!session) return;
  CURRENT_USER = session.user;

  document.getElementById('today-date').textContent = Jalali.formatLongFromISO(TODAY_ISO);

  await Promise.all([
    loadAttendanceToday(),
    loadConsumptionToday(),
    loadIncomingToday(),
    loadNoteToday(),
    loadInventorySummary()
  ]);
}

// ---------- Today's attendance count ----------
async function loadAttendanceToday() {
  const { data, error } = await sb
    .from('attendance')
    .select('id, persons(name, job_title)')
    .eq('work_date', TODAY_ISO);

  const box = document.getElementById('today-attendance');
  if (error) { box.textContent = 'خطا در بارگذاری'; return; }

  if (!data.length) {
    box.innerHTML = `<span class="muted-fa">هنوز کسی ثبت نشده</span>`;
    return;
  }
  box.innerHTML = `<b>${Jalali.toPersianDigits(data.length)} نفر</b> — ` +
    data.map(a => a.persons?.name).filter(Boolean).join('، ');
}

// ---------- Today's consumption ----------
async function loadConsumptionToday() {
  const { data, error } = await sb
    .from('inventory_transactions')
    .select('quantity_change, materials(name, unit)')
    .eq('work_date', TODAY_ISO)
    .eq('type', 'consumption')
    .order('created_at', { ascending: true });

  const box = document.getElementById('today-consumption');
  if (error) { box.textContent = 'خطا در بارگذاری'; return; }
  if (!data.length) { box.innerHTML = `<span class="muted-fa">مصرفی ثبت نشده</span>`; return; }

  box.innerHTML = data.map(t =>
    `<div class="stock-row"><span class="name">${t.materials?.name || '—'}</span>` +
    `<span class="qty">${Utils.fmtQty(Math.abs(t.quantity_change), t.materials?.unit || '')}</span></div>`
  ).join('');
}

// ---------- Today's incoming (purchase) ----------
async function loadIncomingToday() {
  const { data, error } = await sb
    .from('inventory_transactions')
    .select('quantity_change, materials(name, unit)')
    .eq('work_date', TODAY_ISO)
    .eq('type', 'purchase')
    .order('created_at', { ascending: true });

  const box = document.getElementById('today-incoming');
  if (error) { box.textContent = 'خطا در بارگذاری'; return; }
  if (!data.length) { box.innerHTML = `<span class="muted-fa">ورودی ثبت نشده</span>`; return; }

  box.innerHTML = data.map(t =>
    `<div class="stock-row"><span class="name">${t.materials?.name || '—'}</span>` +
    `<span class="qty">${Utils.fmtQty(t.quantity_change, t.materials?.unit || '')}</span></div>`
  ).join('');
}

// ---------- Today's note ----------
async function loadNoteToday() {
  const { data } = await sb
    .from('daily_records')
    .select('note')
    .eq('work_date', TODAY_ISO)
    .maybeSingle();

  const box = document.getElementById('today-note');
  const note = data?.note?.trim();
  box.innerHTML = note ? `“${note}”` : `<span class="muted-fa">یادداشتی ثبت نشده</span>`;
  document.getElementById('note-input').value = note || '';
}

// ---------- Inventory summary + low stock ----------
async function loadInventorySummary() {
  const { data, error } = await sb
    .from('materials')
    .select('id, name, unit, current_quantity, min_quantity')
    .eq('active', true)
    .order('name');

  const box = document.getElementById('inventory-summary');
  const lowBox = document.getElementById('low-stock-box');
  if (error) { box.textContent = 'خطا در بارگذاری'; return; }

  if (!data.length) {
    box.innerHTML = `<div class="empty-state">هنوز کالایی ثبت نشده — از صفحه «مصالح» شروع کنید.</div>`;
    lowBox.style.display = 'none';
    return;
  }

  box.innerHTML = data.slice(0, 6).map(m => {
    const low = m.current_quantity <= m.min_quantity;
    return `<div class="stock-row ${low ? 'low' : ''}">
      <span class="name">${low ? '<span class="warn-badge">⚠️</span>' : ''}${m.name}</span>
      <span class="qty">${Utils.fmtQty(m.current_quantity, m.unit)}</span>
    </div>`;
  }).join('');

  const lowItems = data.filter(m => m.current_quantity <= m.min_quantity);
  if (lowItems.length) {
    lowBox.style.display = 'block';
    lowBox.innerHTML = `<div class="section-title">⚠️ موجودی کم</div>` +
      `<div class="card-flat danger">` +
      lowItems.map(m => `<div class="stock-row low"><span class="name">${m.name}</span><span class="qty">${Utils.fmtQty(m.current_quantity, m.unit)}</span></div>`).join('') +
      `</div>`;
  } else {
    lowBox.style.display = 'none';
  }

  window._materialsCache = data;
}

// ============================================================
// Quick action: ثبت حضور (attendance)
// ============================================================
async function openAttendanceSheet() {
  const list = document.getElementById('attendance-list');
  list.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;
  Utils.openSheet('sheet-attendance');

  const [{ data: persons }, { data: present }] = await Promise.all([
    sb.from('persons').select('id, name, job_title').eq('active', true).order('name'),
    sb.from('attendance').select('person_id').eq('work_date', TODAY_ISO)
  ]);

  const presentIds = new Set((present || []).map(p => p.person_id));

  if (!persons || !persons.length) {
    list.innerHTML = `<div class="empty-state">ابتدا از صفحه «افراد» یک نفر اضافه کنید.</div>`;
    return;
  }

  list.innerHTML = persons.map(p => `
    <label class="check-row">
      <input type="checkbox" data-person="${p.id}" ${presentIds.has(p.id) ? 'checked' : ''} onchange="toggleAttendance('${p.id}', this.checked)">
      <span class="who">${p.name}</span>
      <span class="role">${p.job_title || ''}</span>
    </label>
  `).join('');
}

async function toggleAttendance(personId, checked) {
  if (checked) {
    const { error } = await sb.from('attendance').insert({
      owner_id: CURRENT_USER.id, person_id: personId, work_date: TODAY_ISO
    });
    if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  } else {
    await sb.from('attendance').delete().eq('person_id', personId).eq('work_date', TODAY_ISO);
  }
  loadAttendanceToday();
}

// ============================================================
// Quick action: ثبت مصرف / ورود کالا (shared material picker)
// ============================================================
async function openMaterialSheet(mode) {
  // mode: 'consumption' | 'purchase'
  const sel = document.getElementById('mat-select');
  const title = document.getElementById('mat-sheet-title');
  const submitBtn = document.getElementById('mat-submit-btn');
  document.getElementById('mat-form').dataset.mode = mode;

  title.textContent = mode === 'consumption' ? 'ثبت مصرف امروز' : 'ثبت ورود کالا / خرید';
  submitBtn.textContent = mode === 'consumption' ? 'ثبت مصرف' : 'ثبت ورود';
  submitBtn.className = mode === 'consumption' ? 'btn-app danger' : 'btn-app';

  const materials = window._materialsCache || (await sb.from('materials').select('id,name,unit,current_quantity').eq('active', true).order('name')).data;
  sel.innerHTML = materials.map(m => `<option value="${m.id}" data-unit="${m.unit}">${m.name}</option>`).join('');
  document.getElementById('mat-unit-label').textContent = materials[0]?.unit || '';
  document.getElementById('mat-qty').value = '';
  Utils.openSheet('sheet-material');
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'mat-select') {
    const unit = e.target.selectedOptions[0]?.dataset.unit || '';
    document.getElementById('mat-unit-label').textContent = unit;
  }
});

async function submitMaterialTx(e) {
  e.preventDefault();
  const form = e.target;
  const mode = form.dataset.mode;
  const materialId = document.getElementById('mat-select').value;
  const rawQty = document.getElementById('mat-qty').value;
  const qty = Utils.parsePositiveNumber(rawQty);

  if (!materialId) { Utils.showToast('لطفاً یک کالا انتخاب کنید.'); return; }
  if (qty === null || qty <= 0) { Utils.showToast('لطفاً مقدار را وارد کنید.'); return; }

  const quantity_change = mode === 'consumption' ? -qty : qty;

  const { error } = await sb.from('inventory_transactions').insert({
    owner_id: CURRENT_USER.id,
    material_id: materialId,
    work_date: TODAY_ISO,
    type: mode,
    quantity_change
  });

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  Utils.closeSheet('sheet-material');
  Utils.showToast(mode === 'consumption' ? 'مصرف ثبت شد.' : 'ورود کالا ثبت شد.');
  await Promise.all([loadConsumptionToday(), loadIncomingToday(), loadInventorySummary()]);
}

// ============================================================
// Quick action: اصلاح موجودی (physical stock correction)
// ============================================================
async function openAdjustSheet() {
  const sel = document.getElementById('adj-select');
  const materials = window._materialsCache || (await sb.from('materials').select('id,name,unit,current_quantity').eq('active', true).order('name')).data;
  sel.innerHTML = materials.map(m => `<option value="${m.id}" data-unit="${m.unit}" data-current="${m.current_quantity}">${m.name}</option>`).join('');
  refreshAdjustCurrent();
  document.getElementById('adj-actual').value = '';
  document.getElementById('adj-note').value = '';
  Utils.openSheet('sheet-adjust');
}

function refreshAdjustCurrent() {
  const opt = document.getElementById('adj-select').selectedOptions[0];
  if (!opt) return;
  document.getElementById('adj-current-label').textContent =
    `${Jalali.toPersianDigits(opt.dataset.current)} ${opt.dataset.unit}`;
  document.getElementById('adj-unit-label').textContent = opt.dataset.unit;
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'adj-select') refreshAdjustCurrent();
});

async function submitAdjust(e) {
  e.preventDefault();
  const opt = document.getElementById('adj-select').selectedOptions[0];
  const materialId = opt.value;
  const current = parseFloat(opt.dataset.current);
  const actual = Utils.parsePositiveNumber(document.getElementById('adj-actual').value);
  const note = document.getElementById('adj-note').value.trim();

  if (actual === null || actual < 0) { Utils.showToast('لطفاً موجودی واقعی را وارد کنید.'); return; }

  const diff = Math.round((actual - current) * 100) / 100;
  if (diff === 0) { Utils.showToast('موجودی واقعی با محاسبه‌شده یکسان است؛ نیازی به اصلاح نیست.'); return; }

  const { error } = await sb.from('inventory_transactions').insert({
    owner_id: CURRENT_USER.id,
    material_id: materialId,
    work_date: TODAY_ISO,
    type: 'adjustment',
    quantity_change: diff,
    note: note || null
  });

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  Utils.closeSheet('sheet-adjust');
  Utils.showToast('موجودی اصلاح شد.');
  await loadInventorySummary();
}

// ============================================================
// Quick action: یادداشت امروز
// ============================================================
async function openNoteSheet() {
  Utils.openSheet('sheet-note');
}

async function submitNote(e) {
  e.preventDefault();
  const note = document.getElementById('note-input').value.trim();

  const { error } = await sb.from('daily_records').upsert({
    owner_id: CURRENT_USER.id,
    work_date: TODAY_ISO,
    note
  }, { onConflict: 'owner_id,work_date' });

  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  Utils.closeSheet('sheet-note');
  Utils.showToast('یادداشت ذخیره شد.');
  loadNoteToday();
}

document.addEventListener('DOMContentLoaded', initDashboard);
