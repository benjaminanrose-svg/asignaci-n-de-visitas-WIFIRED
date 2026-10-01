// ============================================================
// WIFIRED · Autenticación (cliente)
// ============================================================
const TK = 'wifired_token';
const US = 'wifired_user';

export function getToken() { return localStorage.getItem(TK); }
export function getUser() { try { return JSON.parse(localStorage.getItem(US)); } catch (e) { return null; } }
export function isAuth() { return !!getToken(); }
export function setToken(t) { if (t) localStorage.setItem(TK, t); }
/** Primer ingreso con clave de fábrica/temporal: crea la clave propia y sigue con sesión nueva. */
export async function cambiarClaveInicial(actual, nueva) {
  const res = await fetch('/api/mi-clave', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: JSON.stringify({ actual, nueva }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña');
  setToken(data.token);
  const u = getUser() || {}; u.debe_cambiar = false;
  localStorage.setItem(US, JSON.stringify(u));
  return u;
}

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
