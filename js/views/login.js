// ============================================================
// WIFIRED · Pantalla de login
// ============================================================
import { login, cambiarClaveInicial } from '../auth.js';

// Clave de fábrica o temporal: antes de entrar debe crear su propia clave.
function pedirCambio(form, actual, onSuccess) {
  form.innerHTML = `
    <p class="login-aviso">🔐 Por seguridad crea tu <b>propia contraseña</b> antes de continuar.<br><span class="muted-sm">Mínimo 8 caracteres, con letras y números.</span></p>
    <div class="field"><label>Nueva contraseña</label><input class="input" name="nueva" type="password" autocomplete="new-password" required autofocus /></div>
    <div class="field"><label>Repite la nueva contraseña</label><input class="input" name="rep" type="password" autocomplete="new-password" required /></div>
    <div class="login-error" id="login-error"></div>
    <button class="btn btn-primary btn-block" type="submit" id="login-btn">Guardar y entrar</button>`;
  const err = form.querySelector('#login-error'), btn = form.querySelector('#login-btn');
  form.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const fd = new FormData(form);
    const nueva = String(fd.get('nueva') || ''), rep = String(fd.get('rep') || '');
    if (nueva !== rep) { err.textContent = 'Las contraseñas no coinciden'; return; }
    if (nueva.length < 8 || !/[a-zA-Z]/.test(nueva) || !/[0-9]/.test(nueva)) { err.textContent = 'Mínimo 8 caracteres, con letras y números'; return; }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try { onSuccess(await cambiarClaveInicial(actual, nueva)); }
    catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Guardar y entrar'; }
  };
}

export function renderLogin(onSuccess) {
  document.body.setAttribute('data-screen', 'login');
  const el = document.createElement('div');
  el.className = 'login-screen';
  el.innerHTML = `
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-mark" style="width:52px;height:52px">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <path d="M6 18c5.5-5.5 14.5-5.5 20 0M9.5 21.5c3.6-3.6 9.4-3.6 13 0M16 25.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z"
              stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          </svg>
        </div>
        <h1>WIFIRED</h1>
        <p>Agenda de Visitas Técnicas · Melipilla</p>
      </div>
      <form id="login-form">
        <div class="field">
          <label>Usuario</label>
          <input class="input" name="username" autocomplete="username" placeholder="tu usuario" required autofocus />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
        </div>
        <div class="login-error" id="login-error"></div>
        <button class="btn btn-primary btn-block" type="submit" id="login-btn">Iniciar sesión</button>
      </form>
      <p class="login-foot">Acceso para coordinación y técnicos</p>
    </div>`;

  const form = el.querySelector('#login-form');
  const err = el.querySelector('#login-error');
  const btn = el.querySelector('#login-btn');
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Ingresando…';
    const fd = new FormData(form);
    try {
      const user = await login(fd.get('username'), fd.get('password'));
      if (user && user.debe_cambiar) { pedirCambio(form, String(fd.get('password') || ''), onSuccess); return; }
      onSuccess(user);
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  };

  document.body.appendChild(el);
}

export function clearLogin() {
  document.body.removeAttribute('data-screen');
  const el = document.querySelector('.login-screen');
  if (el) el.remove();
}
