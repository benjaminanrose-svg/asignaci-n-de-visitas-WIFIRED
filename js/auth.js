// ============================================================
// WIFIRED · Autenticación (cliente)
// ============================================================
const TK = 'wifired_token';
const US = 'wifired_user';

export function getToken() { return localStorage.getItem(TK); }
export function getUser() { try { return JSON.parse(localStorage.getItem(US)); } catch (e) { return null; } }
export function isAuth() { return !!getToken(); }

export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
  localStorage.setItem(TK, data.token);
  localStorage.setItem(US, JSON.stringify(data.user));
  return data.user;
}

export function logout() {
  localStorage.removeItem(TK);
  localStorage.removeItem(US);
  location.hash = '';
  location.reload();
}
