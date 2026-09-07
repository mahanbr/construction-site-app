/* ============================================================
   calendar.js — Jalali calendar + per-day record editor
   ============================================================ */

let CURRENT_USER = null;
let VIEW_JY, VIEW_JM;           // month currently shown in the grid
let SELECTED_ISO = null;        // Gregorian ISO date currently open in the day sheet
let DAYS_WITH_DATA = new Set(); // ISO dates in the visible month that have any record (dot marker)

async function initCalendar() {
  const session = await Utils.requireSession();
  if (!session) return;
  CURRENT_USER = session.user;

  const today = Jalali.todayJalali();
  VIEW_JY = today.jy;
  VIEW_JM = today.jm;
  await renderMonth();
}

function changeMonth(delta) {
  VIEW_JM += delta;
  if (VIEW_JM > 12) { VIEW_JM = 1; VIEW_JY += 1; }
  if (VIEW_JM < 1) { VIEW_JM = 12; VIEW_JY -= 1; }
  renderMonth();
}

async function renderMonth() {
  document.getElementById('cal-month-label').textContent =
    `${Jalali.monthNames[VIEW_JM - 1]} ${Jalali.toPersianDigits(VIEW_JY)}`;

  const daysInMonth = Jalali.daysInJalaliMonth(VIEW_JY, VIEW_JM);
  const firstIso = Jalali.toISO(VIEW_JY, VIEW_JM, 1);
  const lastIso = Jalali.toISO(VIEW_JY, VIEW_JM, daysInMonth);
  const firstDateObj = new Date(firstIso);
  const leadingBlanks = Jalali.faDow(firstDateObj); // 0=Sat

  await loadMonthMarkers(firstIso, lastIso);

  const todayIso = Jalali.todayISO();
  const grid = document.getElementById('cal-grid-days');
  let html = '';
  for (let i = 0; i < leadingBlanks; i++) html += `<div class="cal-day muted"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = Jalali.toISO(VIEW_JY, VIEW_JM, d);
    const classes = ['cal-day'];
    if (iso === todayIso) classes.push('today');
    if (iso === SELECTED_ISO) classes.push('selected');
    const dot = DAYS_WITH_DATA.has(iso) ? '<span class="dot"></span>' : '';
    html += `<div class="${classes.join(' ')}" onclick="openDay('${iso}')">${Jalali.toPersianDigits(d)}${dot}</div>`;
  }
  grid.innerHTML = html;
}

// Marks which days in the visible month have any attendance/transaction/note,
// so the grid shows a small dot without opening every single day.
async function loadMonthMarkers(fromIso, toIso) {
  DAYS_WITH_DATA = new Set();
  const [att, inv, notes] = await Promise.all([
    sb.from('attendance').select('work_date').gte('work_date', fromIso).lte('work_date', toIso),
    sb.from('inventory_transactions').select('work_date').gte('work_date', fromIso).lte('work_date', toIso),
    sb.from('daily_records').select('work_date').gte('work_date', fromIso).lte('work_date', toIso)
  ]);
  [att, inv, notes].forEach(res => (res.data || []).forEach(r => DAYS_WITH_DATA.add(r.work_date)));
}

// ============================================================
// Day detail sheet
// ============================================================
async function openDay(iso) {
  SELECTED_ISO = iso;
  renderMonth(); // refresh selection highlight
  document.getElementById('day-sheet-title').textContent = Jalali.formatLongFromISO(iso);
  Utils.openSheet('sheet-day');

  await Promise.all([
    loadDayAttendance(iso),
    loadDayTransactions(iso),
    loadDayNote(iso)
  ]);
}

async function loadDayAttendance(iso) {
  const box = document.getElementById('day-attendance-list');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const [{ data: persons }, { data: present }] = await Promise.all([
    sb.from('persons').select('id, name, job_title').eq('active', true).order('name'),
    sb.from('attendance').select('person_id').eq('work_date', iso)
  ]);
  const presentIds = new Set((present || []).map(p => p.person_id));

  if (!persons || !persons.length) {
    box.innerHTML = `<div class="empty-state">ابتدا از صفحه «افراد» یک نفر اضافه کنید.</div>`;
    return;
  }

  box.innerHTML = persons.map(p => `
    <label class="check-row">
      <input type="checkbox" ${presentIds.has(p.id) ? 'checked' : ''} onchange="toggleDayAttendance('${p.id}', this.checked)">
      <span class="who">${p.name}</span>
      <span class="role">${p.job_title || ''}</span>
    </label>
  `).join('');
}

async function toggleDayAttendance(personId, checked) {
  if (checked) {
    const { error } = await sb.from('attendance').insert({
      owner_id: CURRENT_USER.id, person_id: personId, work_date: SELECTED_ISO
    });
    if (error) Utils.showToast(Utils.friendlyError(error));
  } else {
    await sb.from('attendance').delete().eq('person_id', personId).eq('work_date', SELECTED_ISO);
  }
  DAYS_WITH_DATA.add(SELECTED_ISO);
}

const DAY_TYPE_LABELS = {
  initial: 'موجودی اولیه', purchase: 'خرید / ورود', consumption: 'مصرف', adjustment: 'اصلاح موجودی'
};

async function loadDayTransactions(iso) {
  const box = document.getElementById('day-tx-list');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const { data, error } = await sb
    .from('inventory_transactions')
    .select('id, type, quantity_change, materials(name, unit)')
    .eq('work_date', iso)
    .order('created_at');

  if (error) { box.innerHTML = `<div class="alert-fa error">${Utils.friendlyError(error)}</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="empty-state">تراکنشی برای این روز ثبت نشده</div>`; return; }

  box.innerHTML = data.map(t => `
    <div class="hist-row">
      <span>${t.materials?.name || '—'}<br><span class="type-tag">${DAY_TYPE_LABELS[t.type] || t.type}</span></span>
      <span class="amt ${t.quantity_change >= 0 ? 'pos' : 'neg'}">${t.quantity_change >= 0 ? '+' : ''}${Utils.fmtQty(t.quantity_change, t.materials?.unit || '')}</span>
      <span></span>
    </div>
  `).join('');
}

async function loadDayNote(iso) {
  const { data } = await sb.from('daily_records').select('note').eq('work_date', iso).maybeSingle();
  document.getElementById('day-note-input').value = data?.note || '';
}

async function submitDayNote(e) {
  e.preventDefault();
  const note = document.getElementById('day-note-input').value.trim();
  const { error } = await sb.from('daily_records').upsert({
    owner_id: CURRENT_USER.id, work_date: SELECTED_ISO, note
  }, { onConflict: 'owner_id,work_date' });
  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  Utils.showToast('یادداشت ذخیره شد.');
  if (note) DAYS_WITH_DATA.add(SELECTED_ISO);
}

// quick add consumption/purchase for the selected day
async function openDayTxSheet(mode) {
  const sel = document.getElementById('day-tx-select');
  const title = document.getElementById('day-tx-title');
  document.getElementById('day-tx-form').dataset.mode = mode;
  title.textContent = mode === 'consumption' ? `ثبت مصرف — ${Jalali.formatShortFromISO(SELECTED_ISO)}` : `ثبت ورود کالا — ${Jalali.formatShortFromISO(SELECTED_ISO)}`;

  const { data: materials } = await sb.from('materials').select('id,name,unit').eq('active', true).order('name');
  if (!materials || !materials.length) { Utils.showToast('ابتدا از صفحه «مصالح» یک کالا اضافه کنید.'); return; }
  sel.innerHTML = materials.map(m => `<option value="${m.id}" data-unit="${m.unit}">${m.name}</option>`).join('');
  document.getElementById('day-tx-unit').textContent = materials[0].unit;
  document.getElementById('day-tx-qty').value = '';
  Utils.openSheet('sheet-day-tx');
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'day-tx-select') {
    document.getElementById('day-tx-unit').textContent = e.target.selectedOptions[0]?.dataset.unit || '';
  }
});

async function submitDayTx(e) {
  e.preventDefault();
  const mode = document.getElementById('day-tx-form').dataset.mode;
  const materialId = document.getElementById('day-tx-select').value;
  const qty = Utils.parsePositiveNumber(document.getElementById('day-tx-qty').value);
  if (qty === null || qty <= 0) { Utils.showToast('لطفاً مقدار را وارد کنید.'); return; }

  const { error } = await sb.from('inventory_transactions').insert({
    owner_id: CURRENT_USER.id, material_id: materialId, work_date: SELECTED_ISO,
    type: mode, quantity_change: mode === 'consumption' ? -qty : qty
  });
  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  Utils.closeSheet('sheet-day-tx');
  Utils.showToast('ثبت شد.');
  DAYS_WITH_DATA.add(SELECTED_ISO);
  loadDayTransactions(SELECTED_ISO);
}

document.addEventListener('DOMContentLoaded', initCalendar);
