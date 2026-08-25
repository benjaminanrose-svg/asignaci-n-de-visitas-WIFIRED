// ============================================================
// WIFIRED · Vista Clientes — directorio de clientes
// Agrupa todas las visitas por cliente (RUT → teléfono → nombre) y
// muestra una tarjeta por cliente con su resumen. Al tocar una, se
// abre la ficha completa con todo su historial (misma ficha que se
// usa dentro del detalle de una visita).
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, fmtDateShort, limpiaRut, normalizaFono, formatRut } from '../util.js';
import { clientAvatar, clientCardModal, workOrderModal, openModal, closeModal } from '../components.js';
import { visitFormModal } from '../form.js';

const local = { q: '', orden: 'reciente' };

function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/** Clave estable de agrupación: RUT → teléfono → nombre */
function clientKey(v) {
  const rut = limpiaRut(v.rut);
  if (rut && rut.length >= 2) return 'r:' + rut;
  const fono = normalizaFono(v.telefono);
  if (fono) return 'f:' + fono;
  const name = normName(v.cliente);
  if (name) return 'n:' + name;
  return 'u:' + v._uid;
}

const ACTIVAS = ['Pendiente', 'Programada', 'Reprogramada'];

/** Construye la lista de clientes únicos a partir de todas las visitas */
function buildClientes() {
  const map = new Map();
  for (const v of store.visitas()) {
    const k = clientKey(v);
    let g = map.get(k);
    if (!g) { g = { key: k, visitas: [] }; map.set(k, g); }
    g.visitas.push(v);
  }
  const first = (vis, getter) => { for (const x of vis) { const val = getter(x); if (val) return val; } return ''; };
  const list = [];
  for (const g of map.values()) {
    const vis = g.visitas.slice()
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || String(b.id).localeCompare(String(a.id)));
    const rep = vis[0]; // visita más reciente = representante del cliente
    list.push({
      key: g.key,
      rep,
      nombre: first(vis, (x) => x.cliente) || 'Sin nombre',
      rut: first(vis, (x) => x.rut),
      telefono: first(vis, (x) => x.telefono),
      email: first(vis, (x) => x.email),
      direccion: first(vis, (x) => x.direccion),
      total: vis.length,
      activas: vis.filter((x) => ACTIVAS.includes(x.estado)).length,
      completadas: vis.filter((x) => x.estado === 'Completada').length,
      canceladas: vis.filter((x) => x.estado === 'Cancelada').length,
      ultimaFecha: rep.fecha || '',
    });
  }
  return list;
}

// Caché de servicios (se recarga cada 60s) para no pedirlos en cada re-render.
const svcCache = { ts: 0, list: [] };
async function cargarServicios() {
  if (Date.now() - svcCache.ts < 60000 && svcCache.list.length) return svcCache.list;
  try { const r = await store.listServicios(); svcCache.list = (r && r.servicios) || []; svcCache.ts = Date.now(); }
  catch (e) { /* si falla, seguimos solo con visitas */ }
  return svcCache.list;
}
/** Misma clave que clientKey pero desde un servicio: RUT → teléfono → nombre. */
function servicioKey(s) {
  const rut = limpiaRut(s.rut);
  if (rut && rut.length >= 2) return 'r:' + rut;
  const fono = normalizaFono(s.telefono);
  if (fono) return 'f:' + fono;
  const name = normName(s.nombre);
  if (name) return 'n:' + name;
  return 's:' + s._uid;
}
/** Lista unificada: clientes de visitas + servicios, juntados por clave.
 *  NO pisa datos existentes de Clientes; solo rellena lo que falta y adjunta el servicio. */
function buildMerged(servicios) {
  const list = buildClientes();
  const map = new Map(list.map((c) => [c.key, c]));
  for (const s of servicios) {
    const k = servicioKey(s);
    let c = map.get(k);
    if (c) {
      c.rut = c.rut || s.rut; c.telefono = c.telefono || s.telefono;
      c.email = c.email || s.email; c.direccion = c.direccion || s.direccion;
      c.servicio = s;
    } else {
      c = {
        key: k, rep: null, nombre: s.nombre || 'Sin nombre', rut: s.rut || '', telefono: s.telefono || '',
        email: s.email || '', direccion: s.direccion || '', total: 0, activas: 0, completadas: 0, canceladas: 0,
        ultimaFecha: '', servicio: s,
      };
      map.set(k, c); list.push(c);
    }
  }
  return list;
}

export function renderClientes(root) {
  root.innerHTML = `
    <div class="hist-intro muted-sm">👥 Todos tus clientes en un solo lugar (visitas + servicios de internet). Los que tienen internet muestran 📡 con su plan. La IP y el usuario PPPoE se ven en <b>Servicios</b>.</div>
    <div class="filters">
      <div class="search-box" style="flex:1; min-width:220px; max-width:420px">
        <span class="search-ico">⌕</span>
        <input type="search" class="input" data-q placeholder="Buscar por nombre, RUT, teléfono o dirección…" value="${esc(local.q)}" autocomplete="off">
      </div>
      <select class="select" data-orden>
        <option value="reciente" ${local.orden === 'reciente' ? 'selected' : ''}>Más recientes primero</option>
        <option value="nombre" ${local.orden === 'nombre' ? 'selected' : ''}>Por nombre (A-Z)</option>
        <option value="visitas" ${local.orden === 'visitas' ? 'selected' : ''}>Más visitas primero</option>
        <option value="activas" ${local.orden === 'activas' ? 'selected' : ''}>Con visitas activas primero</option>
      </select>
      <div class="grow"></div>
      <button class="btn btn-sm" data-clear>Limpiar</button>
    </div>
    <div id="cli-host"></div>`;

  const host = root.querySelector('#cli-host');
  const inputQ = root.querySelector('[data-q]');
  inputQ.oninput = () => { local.q = inputQ.value.trim().toLowerCase(); paint(); };
  root.querySelector('[data-orden]').onchange = (e) => { local.orden = e.target.value; paint(); };
  root.querySelector('[data-clear]').onclick = () => { local.q = ''; local.orden = 'reciente'; renderClientes(root); };

  function paint() {
    let list = buildMerged(svcCache.list);
    if (local.q) {
      list = list.filter((c) =>
        [c.nombre, c.rut, c.telefono, c.email, c.direccion, c.servicio && c.servicio.plan, c.servicio && c.servicio.pppoe_user]
          .some((f) => (f || '').toLowerCase().includes(local.q)));
    }
    if (local.orden === 'nombre') list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    else if (local.orden === 'visitas') list.sort((a, b) => b.total - a.total || (b.ultimaFecha || '').localeCompare(a.ultimaFecha || ''));
    else if (local.orden === 'activas') list.sort((a, b) => b.activas - a.activas || (b.ultimaFecha || '').localeCompare(a.ultimaFecha || ''));
    else list.sort((a, b) => (b.ultimaFecha || '').localeCompare(a.ultimaFecha || '')); // reciente

    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><div class="es-ico">🔍</div><p>${local.q ? 'No se encontraron clientes con esa búsqueda.' : 'Aún no hay clientes registrados.'}</p></div>`;
      return;
    }

    host.innerHTML = `
      <div class="cli-grid">
        ${list.map(cardHtml).join('')}
      </div>
      <div class="muted-sm" style="padding:14px 4px 0">${list.length} cliente${list.length === 1 ? '' : 's'}${local.q ? ` · búsqueda: "${esc(local.q)}"` : ''}</div>`;

    host.querySelectorAll('[data-key]').forEach((el) => (el.onclick = () => {
      const c = list.find((x) => x.key === el.dataset.key);
      if (!c) return;
      if (c.rep) abrirFicha(c.rep);
      else abrirServicioInfo(c);
    }));
  }

  paint();
  // Cargar servicios y volver a pintar unificado (no bloquea la vista inicial).
  cargarServicios().then(() => paint());
}

/** Ficha simple para clientes que solo existen como servicio (importados, sin visitas). */
function abrirServicioInfo(c) {
  const s = c.servicio || {};
  const fila = (etq, val) => val ? `<div class="cell-sub" style="margin:2px 0">${etq}: <b>${esc(val)}</b></div>` : '';
  const estado = s.estado === 'cortado'
    ? '<span class="tag" style="background:color-mix(in srgb,#ef4444 16%,transparent);border-color:color-mix(in srgb,#ef4444 40%,var(--border));color:#dc2626">Cortado</span>'
    : '<span class="tag" style="background:color-mix(in srgb,#10b981 16%,transparent);border-color:color-mix(in srgb,#10b981 40%,var(--border));color:#0f9d68">Activo</span>';
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="modal-head"><h3>${esc(c.nombre)}</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm">Cliente con servicio de internet (aún sin visitas registradas).</p>
      ${fila('RUT', s.rut ? formatRut(s.rut) : '')}
      ${fila('Teléfono', s.telefono)}
      ${fila('Dirección', s.direccion)}
      ${fila('Plan', s.plan)}
      ${fila('Nodo', s.nodo)}
      <div class="cell-sub" style="margin:8px 0">Estado del servicio: ${estado}</div>
      <p class="muted-sm">La IP y el usuario PPPoE se gestionan en la sección <b>Servicios</b>.</p>
    </div>
    <div class="modal-foot">
      <div class="grow"></div>
      <button class="btn" data-x2>Cerrar</button>
      <button class="btn btn-primary" data-svc>Ver en Servicios</button>
    </div>`;
  openModal(box, 'sm');
  box.querySelector('[data-x]').onclick = () => closeModal();
  box.querySelector('[data-x2]').onclick = () => closeModal();
  box.querySelector('[data-svc]').onclick = () => { closeModal(); location.hash = '#/servicios'; };
}

function abrirFicha(rep) {
  const opts = store.isCoordinador()
    ? { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) }
    : { onOrder: (x) => workOrderModal(x, store.company), readOnly: true };
  clientCardModal(rep, opts);
}

function cardHtml(c) {
  const ident = [c.rut ? '🪪 ' + esc(formatRut(c.rut)) : '', c.telefono ? '📞 ' + esc(c.telefono) : '']
    .filter(Boolean).join('  ·  ');
  const chip = (n, sing, plur, tint) => n
    ? `<span class="tag" style="background:color-mix(in srgb, ${tint} 16%, transparent); border-color:color-mix(in srgb, ${tint} 40%, var(--border)); color:${tint}">${n} ${n === 1 ? sing : plur}</span>`
    : '';
  const svc = c.servicio;
  const svcTint = svc && svc.estado === 'cortado' ? '#dc2626' : '#0f9d68';
  const svcBadge = svc
    ? `<span class="tag" style="background:color-mix(in srgb, ${svcTint} 16%, transparent); border-color:color-mix(in srgb, ${svcTint} 40%, var(--border)); color:${svcTint}">📡 ${esc(svc.plan || 'Servicio')}${svc.estado === 'cortado' ? ' · Cortado' : ''}</span>`
    : '';
  const badges = [
    chip(c.activas, 'activa', 'activas', 'var(--brand-500)'),
    chip(c.completadas, 'completada', 'completadas', 'var(--accent)'),
    chip(c.canceladas, 'cancelada', 'canceladas', 'var(--text-3)'),
    svcBadge,
  ].filter(Boolean).join(' ');
  const foot = c.rep
    ? `Última: ${esc(fmtDateShort(c.ultimaFecha) || '—')} · ${esc(parseTecnico(c.rep.tecnico).short || 'sin asignar')}`
    : '📡 Cliente con servicio (sin visitas aún)';
  const cuenta = c.rep ? c.total : '📡';
  return `
    <button class="card cli-card" data-key="${esc(c.key)}">
      <div class="row" style="gap:12px; align-items:flex-start">
        ${clientAvatar(c.nombre)}
        <div style="flex:1; min-width:0; text-align:left">
          <div class="cell-strong truncate">${esc(c.nombre)}</div>
          ${ident ? `<div class="cell-sub truncate">${ident}</div>` : ''}
          ${c.direccion ? `<div class="cell-sub truncate">📍 ${esc(c.direccion)}</div>` : ''}
        </div>
        <span class="cli-count">${cuenta}</span>
      </div>
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-top:10px">
        ${badges || '<span class="muted-sm">Sin visitas activas</span>'}
      </div>
      <div class="cli-foot muted-sm">${foot}</div>
    </button>`;
}
