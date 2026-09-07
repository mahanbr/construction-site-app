/* ============================================================
   auth.js — login page logic + shared logout handler
   No public sign-up: the single owner account is created from the
   Supabase dashboard (Authentication -> Users -> Add user).
   ============================================================ */

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-error');
  errBox.style.display = 'none';

  const btn = document.getElementById('login-submit');
  btn.disabled = true;
  btn.textContent = 'در حال ورود...';

  const { error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'ورود';

  if (error) {
    errBox.textContent = Utils.friendlyError(error);
    errBox.style.display = 'block';
    return;
  }
  window.location.href = 'index.html';
}

async function handleLogout() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

// If already logged in, skip the login page entirely.
async function redirectIfLoggedIn() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) window.location.href = 'index.html';
}
