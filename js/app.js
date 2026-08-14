// ============================================================
// WIFIRED · App — router + arranque + auth por rol
// ============================================================
import { initStore, subscribe, currentUser, isPersistent, refresh } from './store.js';
import * as store from './store.js';
import { visitFormModal } from './form.js';
import { visitDetailModal, workOrderModal, openModal, closeModal, downloadEvidence } from './components.js';
import { renderPanel } from './views/panel.js';
import { renderAgenda } from './views/agenda.js';
import { renderCalendario } from './views/calendario.js';
import { renderVisitas } from './views/visitas.js';
import { renderTecnicos } from './views/tecnicos.js';
import { renderTecnico } from './views/tecnico.js';
import { renderLogin, clearLogin } from './views/login.js';
import { isAuth, logout } from './auth.js';
import { registerSW } from './push.js';
import { debounce, initials, esc, parseTecnico, toast } from './util.js';

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

// ---------- Notificaciones de reagenda (coordinación) ----------
let prevReqCount = null;
function updateBell() {
  const reqs = store.visitas().filter((v) => v.reagenda_solicitada);
  let bell = document.getElementById('notif-bell');
  if (!bell) {
    bell = document.createElement('button');
    bell.id = 'notif-bell';
    bell.className = 'notif-bell';
    bell.title = 'Solicitudes de reagenda';
    bell.innerHTML = '🔔<span class="notif-count"></span>';
    bell.onclick = () => reqPanel();
    const actions = document.querySelector('.topbar-actions');
    actions.insertBefore(bell, actions.querySelector('.user-chip'));
  }
  const c = reqs.length;
  const badge = bell.querySelector('.notif-count');
  badge.textContent = c;
  badge.style.display = c ? '' : 'none';
  bell.classList.toggle('has', c > 0);
  if (prevReqCount !== null && c > prevReqCount) toast(`🔔 ${c - prevReqCount} nueva(s) solicitud(es) de reagenda`, 'info');
  prevReqCount = c;
}

function reqPanel() {
  const reqs = store.visitas().filter((v) => v.reagenda_solicitada);
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Solicitudes de reagenda (${reqs.length})</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      ${reqs.length ? reqs.map((v) => `
        <div class="day-row" style="cursor:default">
          <span class="grow" data-open="${esc(v._uid)}" style="min-width:0; cursor:pointer">
            <span class="cell-strong truncate" style="display:block">${esc(v.cliente || 'Sin nombre')}</span>
            <span class="cell-sub truncate" style="display:block">${esc(parseTecnico(v.tecnico).short)} · ${esc(v.reagenda_motivo || 'Sin motivo')}</span>
          </span>
          ${(v.evidencias || []).length ? `<button class="btn btn-sm" data-dl="${esc(v._uid)}" title="Descargar evidencia">⭳</button>` : ''}
          <button class="btn btn-sm btn-primary" data-open="${esc(v._uid)}">Reagendar</button>
        </div>`).join('') : '<p class="muted" style="padding:10px 0">No hay solicitudes pendientes. 🎉</p>'}
    </div>`;
  node.querySelector('[data-close]').onclick = closeModal;
  node.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = () => { const v = store.byUid(b.dataset.dl); if (v) downloadEvidence(v); }));
  node.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => {
    const v = store.byUid(b.dataset.open);
    closeModal();
    if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
  }));
  openModal(node, 'md');
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

let onlineListenersSet = false;
function setupOnlineOfflineListeners() {
  if (onlineListenersSet) return;
  onlineListenersSet = true;
  window.addEventListener('online', () => {
    toast('📡 Conexión restaurada', 'ok');
    setTimeout(() => refresh(), 1500);
  });
  window.addEventListener('offline', () => toast('📵 Sin conexión — usando datos guardados', 'info'));
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

  // Aviso: sin base de datos los cambios no persisten entre reinicios
  const prev = document.getElementById('no-db-bar');
  if (prev) prev.remove();
  if (!isPersistent()) {
    const bar = document.createElement('div');
    bar.id = 'no-db-bar';
    bar.className = 'no-db-bar';
    bar.innerHTML = '⚠️ <strong>Sin base de datos conectada</strong> — los cambios se perderán al reiniciar. Conecta PostgreSQL en Railway para guardar todo de forma permanente.';
    document.querySelector('.main').prepend(bar);
  }

  subscribe(() => { if (!esTecnico) updateBell(); if (REACTIVE.includes(current)) render(); });
  window.addEventListener('hashchange', render);
  if (!esTecnico) updateBell();

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
  setupOnlineOfflineListeners();
  render();

  // Auto-actualización suave: no interrumpe si hay un modal abierto o edición en curso
  setInterval(() => {
    if (document.getElementById('modal-root').children.length) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    refresh();
  }, 30000);
}

function boot() {
  registerSW();
  if (!isAuth()) {
    document.getElementById('app').style.display = 'none';
    renderLogin(() => startApp());
  } else {
    startApp();
  }
}

boot();
