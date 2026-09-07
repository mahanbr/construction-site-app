/* ============================================================
   utils.js — shared helpers used across all pages
   ============================================================ */

const Utils = (() => {

  function showToast(message, ms = 2600) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className = 'toast-fa';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // Opens a bottom sheet given its container element id.
  function openSheet(sheetId) {
    let overlay = document.getElementById('sheet-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sheet-overlay';
      overlay.className = 'sheet-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => closeSheet(sheetId));
    }
    overlay.classList.add('show');
    const sheet = document.getElementById(sheetId);
    sheet.classList.add('show');
  }

  function closeSheet(sheetId) {
    const overlay = document.getElementById('sheet-overlay');
    if (overlay) overlay.classList.remove('show');
    const sheet = document.getElementById(sheetId);
    if (sheet) sheet.classList.remove('show');
  }

  // Maps common Postgres/Supabase error patterns to plain Persian messages.
  function friendlyError(err) {
    const msg = (err && (err.message || err.error_description || err.toString())) || '';
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return 'این مورد قبلاً ثبت شده است.';
    }
    if (msg.includes('chk_invtx_sign') || msg.includes('chk_tooltx_sign')) {
      return 'مقدار وارد شده برای این نوع تراکنش معتبر نیست.';
    }
    if (msg.includes('Invalid login credentials')) {
      return 'ایمیل یا رمز عبور اشتباه است.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.';
    }
    return 'خطایی رخ داد. لطفاً دوباره تلاش کنید.';
  }

  function parsePositiveNumber(raw) {
    const latin = Jalali.toLatinDigits(String(raw).trim());
    const n = parseFloat(latin);
    if (isNaN(n)) return null;
    return n;
  }

  function fmtQty(n, unit) {
    // trims trailing .0, formats with Persian digits
    const rounded = Math.round(n * 100) / 100;
    const str = (rounded % 1 === 0) ? String(rounded) : String(rounded);
    return `${Jalali.toPersianDigits(str)} ${unit}`;
  }

  function disableWhileSubmitting(btn, fn) {
    return async (...args) => {
      if (btn.disabled) return;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'در حال ثبت...';
      try {
        await fn(...args);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };
  }

  async function requireSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    return session;
  }

  return {
    showToast, openSheet, closeSheet, friendlyError,
    parsePositiveNumber, fmtQty, disableWhileSubmitting, requireSession
  };
})();
