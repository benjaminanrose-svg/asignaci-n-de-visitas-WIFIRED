// ============================================================
// WIFIRED · App — router + arranque
// ============================================================
import { initStore, subscribe } from './store.js';
import { visitFormModal } from './form.js';
import { renderPanel } from './views/panel.js';
import { renderAgenda } from './views/agenda.js';
import { renderVisitas } from './views/visitas.js';
import { renderTecnicos } from './views/tecnicos.js';
import { debounce } from './util.js';

const ROUTES = {
  panel:    { title: 'Panel de control',        render: renderPanel },
  agenda:   { title: 'Agenda / Asignación',     render: renderAgenda },
  visitas:  { title: 'Registro de visitas',     render: renderVisitas },
  tecnicos: { title: 'Técnicos',                render: renderTecnicos },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
let current = 'panel';

// contexto compartido de búsqueda global
export const ctx = { search: '' };

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  return ROUTES[hash] ? hash : 'panel';
}

function render() {
  current = currentRoute();
  const route = ROUTES[current];
  titleEl.textContent = route.title;
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === current);
  });
  viewEl.innerHTML = '';
  route.render(viewEl, ctx);
  // cerrar menú móvil
  document.getElementById('sidebar').classList.remove('open');
}

async function boot() {
  viewEl.innerHTML = `<div class="empty-state"><div class="es-ico">◐</div><p>Cargando datos…</p></div>`;
  try {
    await initStore();
  } catch (e) {
    viewEl.innerHTML = `<div class="empty-state"><div class="es-ico">⚠</div><p>No se pudo conectar con el servidor.</p><p class="muted-sm">${e.message}</p></div>`;
    return;
  }

  // Re-render cuando cambian los datos (si estamos en una vista reactiva)
  subscribe(() => { if (['panel', 'agenda', 'visitas', 'tecnicos'].includes(current)) render(); });

  window.addEventListener('hashchange', render);

  document.getElementById('btn-nueva-visita').onclick = () => visitFormModal();
  document.getElementById('btn-menu').onclick = () =>
    document.getElementById('sidebar').classList.toggle('open');

  const search = document.getElementById('global-search');
  search.addEventListener('input', debounce((e) => {
    ctx.search = e.target.value.trim().toLowerCase();
    // buscar salta a la lista de visitas
    if (ctx.search && current !== 'visitas') { location.hash = '#/visitas'; }
    else { render(); }
  }, 200));

  if (!location.hash) location.hash = '#/panel';
  render();
}

boot();
