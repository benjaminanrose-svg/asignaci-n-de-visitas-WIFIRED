// ============================================================
// WIFIRED · App — router + arranque + auth por rol
// ============================================================
import { initStore, subscribe, currentUser } from './store.js';
import { visitFormModal } from './form.js';
import { renderPanel } from './views/panel.js';
import { renderAgenda } from './views/agenda.js';
import { renderCalendario } from './views/calendario.js';
import { renderVisitas } from './views/visitas.js';
import { renderTecnicos } from './views/tecnicos.js';
import { renderTecnico } from './views/tecnico.js';
import { renderLogin, clearLogin } from './views/login.js';
import { isAuth, logout } from './auth.js';
import { debounce, initials } from './util.js';

const ROUTES = {
  panel:      { title: 'Panel de control',    render: renderPanel },
  agenda:     { title: 'Agenda / Asignación', render: renderAgenda },
  calendario: { title: 'Calendario',          render: renderCalendario },
  visitas:    { title: 'Registro de visitas', render: renderVisitas },
  tecnicos:   { title: 'Técnicos',            render: renderTecnicos },
};
const REACTIVE = ['panel', 'agenda', 'calendario', 'visitas', 'tecnicos', 'mis-visitas'];

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
let current = 'panel';
let esTecnico = false;
export const ctx = { search: '' };

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  return ROUTES[hash] ? hash : 'panel';
}

function render() {
  if (esTecnico) {
    current = 'mis-visitas';
    titleEl.textContent = 'Mis visitas';
    viewEl.innerHTML = '';
    renderTecnico(viewEl);
    return;
  }
  current = currentRoute();
  const route = ROUTES[current];
  titleEl.textContent = route.title;
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === current));
  viewEl.innerHTML = '';
  route.render(viewEl, ctx);
  document.getElementById('sidebar').classList.remove('open');
}

function setupUserChip() {
  const u = currentUser() || {};
  const chip = document.querySelector('.user-chip');
  const nombre = u.rol === 'coordinador' ? 'Coordinación' : (u.nombre || 'Usuario');
  chip.innerHTML = `
    <div class="avatar">${initials(nombre)}</div>
    <div class="user-meta">
      <strong>${nombre}</strong>
      <span>${u.rol === 'coordinador' ? 'WIFIRED Ltda.' : 'Técnico'}</span>
    </div>
    <button class="icon-btn" id="btn-logout" title="Cerrar sesión" style="margin-left:6px">⏻</button>`;
  chip.querySelector('#btn-logout').onclick = logout;
}

async function startApp() {
  clearLogin();
  document.getElementById('app').style.display = '';
  viewEl.innerHTML = `<div class="empty-state"><div class="es-ico">◐</div><p>Cargando…</p></div>`;
  try {
    await initStore();
  } catch (e) {
    viewEl.innerHTML = `<div class="empty-state"><div class="es-ico">⚠</div><p>No se pudo conectar.</p><p class="muted-sm">${e.message}</p></div>`;
    return;
  }

  esTecnico = currentUser() && currentUser().rol === 'tecnico';
  document.body.setAttribute('data-role', esTecnico ? 'tecnico' : 'coordinador');
  setupUserChip();

  subscribe(() => { if (REACTIVE.includes(current)) render(); });
  window.addEventListener('hashchange', render);

  document.getElementById('btn-menu').onclick = () => document.getElementById('sidebar').classList.toggle('open');

  if (!esTecnico) {
    document.getElementById('btn-nueva-visita').onclick = () => visitFormModal();
    const search = document.getElementById('global-search');
    search.addEventListener('input', debounce((e) => {
      ctx.search = e.target.value.trim().toLowerCase();
      if (ctx.search && current !== 'visitas') location.hash = '#/visitas';
      else render();
    }, 200));
    if (!location.hash) location.hash = '#/panel';
  }
  render();
}

function boot() {
  if (!isAuth()) {
    document.getElementById('app').style.display = 'none';
    renderLogin(() => startApp());
  } else {
    startApp();
  }
}

boot();
