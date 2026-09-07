/* ============================================================
   workers.js — persons list, add/edit, attendance history
   ============================================================ */

let CURRENT_USER = null;
let EDITING_PERSON_ID = null;

async function initWorkers() {
  const session = await Utils.requireSession();
  if (!session) return;
  CURRENT_USER = session.user;
  await loadPersons();
}

async function loadPersons() {
  const box = document.getElementById('persons-list');
  box.innerHTML = `<div class="loading-fa">در حال بارگذاری...</div>`;

  const { data, error } = await sb
    .from('persons')
    .select('id, name, job_title, notes, active')
    .order('active', { ascending: false })
    .order('name');

  if (error) { box.innerHTML = `<div class="alert-fa error">${Utils.friendlyError(error)}</div>`; return; }

  if (!data.length) {
    box.innerHTML = `<div class="empty-state">هنوز کسی اضافه نشده. با دکمه «+ افزودن نفر» شروع کنید.</div>`;
    return;
  }

  box.innerHTML = data.map(p => `
    <div class="card-flat ${p.active ? '' : 'danger'}" style="cursor:pointer;" onclick="openPersonDetail('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;">${p.name}</div>
          <div style="color:var(--muted);font-size:.85rem;">${p.job_title || ''}</div>
        </div>
        ${p.active ? '' : '<span class="pill off">غیرفعال</span>'}
      </div>
    </div>
  `).join('');
}

function openAddPersonSheet() {
  EDITING_PERSON_ID = null;
  document.getElementById('person-sheet-title').textContent = 'افزودن نفر جدید';
  document.getElementById('p-name').value = '';
  document.getElementById('p-job').value = '';
  document.getElementById('p-notes').value = '';
  document.getElementById('p-active-row').style.display = 'none';
  document.getElementById('p-delete-btn').style.display = 'none';
  Utils.openSheet('sheet-person');
}

async function openPersonDetail(id) {
  const { data: p, error } = await sb.from('persons').select('*').eq('id', id).single();
  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }

  EDITING_PERSON_ID = id;
  document.getElementById('person-sheet-title').textContent = 'ویرایش نفر';
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-job').value = p.job_title || '';
  document.getElementById('p-notes').value = p.notes || '';
  document.getElementById('p-active-row').style.display = 'flex';
  document.getElementById('p-active').checked = p.active;
  document.getElementById('p-delete-btn').style.display = 'block';

  // attendance history (last 10)
  const { data: att } = await sb
    .from('attendance')
    .select('work_date')
    .eq('person_id', id)
    .order('work_date', { ascending: false })
    .limit(10);

  const histBox = document.getElementById('p-attendance-hist');
  if (att && att.length) {
    histBox.innerHTML = `<div class="form-label-fa" style="margin-top:16px;">حضور اخیر</div>` +
      att.map(a => `<div class="hist-row"><span>${Jalali.formatShortFromISO(a.work_date)}</span><span></span><span></span></div>`).join('');
  } else {
    histBox.innerHTML = '';
  }

  Utils.openSheet('sheet-person');
}

async function submitPerson(e) {
  e.preventDefault();
  const name = document.getElementById('p-name').value.trim();
  const job = document.getElementById('p-job').value.trim();
  const notes = document.getElementById('p-notes').value.trim();

  if (!name) { Utils.showToast('لطفاً نام را وارد کنید.'); return; }

  if (EDITING_PERSON_ID) {
    const active = document.getElementById('p-active').checked;
    const { error } = await sb.from('persons').update({
      name, job_title: job || null, notes: notes || null, active, updated_at: new Date().toISOString()
    }).eq('id', EDITING_PERSON_ID);
    if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
    Utils.showToast('تغییرات ذخیره شد.');
  } else {
    const { error } = await sb.from('persons').insert({
      owner_id: CURRENT_USER.id, name, job_title: job || null, notes: notes || null
    });
    if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
    Utils.showToast('نفر جدید اضافه شد.');
  }

  Utils.closeSheet('sheet-person');
  loadPersons();
}

async function deletePerson() {
  if (!EDITING_PERSON_ID) return;
  if (!confirm('این شخص حذف شود؟ (پیشنهاد می‌شود به‌جای حذف، غیرفعال کنید تا سابقه حضور حفظ شود)')) return;
  const { error } = await sb.from('persons').delete().eq('id', EDITING_PERSON_ID);
  if (error) { Utils.showToast(Utils.friendlyError(error)); return; }
  Utils.closeSheet('sheet-person');
  Utils.showToast('حذف شد.');
  loadPersons();
}

document.addEventListener('DOMContentLoaded', initWorkers);
