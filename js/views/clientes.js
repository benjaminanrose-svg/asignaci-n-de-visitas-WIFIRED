// ============================================================
// WIFIRED · Vista Clientes — directorio de clientes
// Agrupa todas las visitas por cliente (RUT → teléfono → nombre) y
// muestra una tarjeta por cliente con su resumen. Al tocar una, se
// abre la ficha completa con todo su historial (misma ficha que se
// usa dentro del detalle de una visita).
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, fmtDateShort, limpiaRut, normalizaFono, formatRut } from '../util.js';
import { clientAvatar, clientCardModal, workOrderModal } from '../components.js';
import { visitFormModal } from '../form.js';
import { editServicioModal } from './servicios.js';

const local = { q: '', orden: 'reciente', nodo: '' };

/** Nodo de un cliente: del servicio de internet, o de su visita representante. */
function clientNodo(c) { return (c.servicio && c.servicio.nodo) || (c.rep && c.rep.nodo) || ''; }

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
// Caché de inventario (equipos instalados) para el contador por cliente.
const invCache = { ts: 0, list: [] };
async function cargarInventario() {
  if (Date.now() - invCache.ts < 60000 && invCache.list.length) return invCache.list;
  try { const r = await store.listInventario(); invCache.list = (r && r.inventario) || []; invCache.ts = Date.now(); }
  catch (e) { /* sin permiso o sin datos: contador queda en 0 */ }
  return invCache.list;
}
function equiposDe(nombre) {
  const nn = normName(nombre);
  return nn ? invCache.list.filter((it) => it.estado === 'instalado' && normName(it.cliente) === nn).length : 0;
}
function estadoCliente(c) {
  const s = c.servicio;
  if (!s) return { txt: 'Pendiente', tint: '#c79232' };
  if (s.estado === 'cortado') return { txt: 'Suspendido', tint: '#dc2626' };
  return { txt: 'Activo', tint: '#0f9d68' };
}
function tagEstado(est) {
  return `<span class="tag" style="background:color-mix(in srgb, ${est.tint} 16%, transparent);border-color:color-mix(in srgb, ${est.tint} 40%, var(--border));color:${est.tint}">${est.txt}</span>`;
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
      <select class="select" data-nodo><option value="">Todos los nodos</option></select>
      <div class="grow"></div>
      <button class="btn btn-sm" data-clear>Limpiar</button>
    </div>
    <div id="cli-host"></div>`;

  const host = root.querySelector('#cli-host');
  const inputQ = root.querySelector('[data-q]');
  inputQ.oninput = () => { local.q = inputQ.value.trim().toLowerCase(); paint(); };
  root.querySelector('[data-orden]').onchange = (e) => { local.orden = e.target.value; paint(); };
  root.querySelector('[data-nodo]').onchange = (e) => { local.nodo = e.target.value; paint(); };
  root.querySelector('[data-clear]').onclick = () => { local.q = ''; local.orden = 'reciente'; local.nodo = ''; renderClientes(root); };

  // Puebla el <select> de nodos con los nodos del sistema + los de los servicios.
  function pintarNodos(full) {
    const sel = root.querySelector('[data-nodo]');
    if (!sel) return;
    const set = new Set();
    (store.nodos ? store.nodos() : []).forEach((n) => { if (n) set.add(n); });
    full.forEach((c) => { const nd = clientNodo(c); if (nd) set.add(nd); });
    const nodos = [...set].sort((a, b) => a.localeCompare(b, 'es'));
    if (local.nodo && !nodos.includes(local.nodo)) local.nodo = ''; // nodo ya inexistente
    sel.innerHTML = '<option value="">Todos los nodos</option>' + nodos.map((n) => `<option value="${esc(n)}" ${n === local.nodo ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }

  function paint() {
    const full = buildMerged(svcCache.list);
    pintarNodos(full);
    // Filtro por nodo. Los clientes sin nodo solo aparecen en "Todos los nodos"
    // (no se pierden: quedan visibles al quitar el filtro).
    let list = local.nodo ? full.filter((c) => clientNodo(c) === local.nodo) : full;
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
      host.innerHTML = `<div class="empty-state"><div class="es-ico">🔍</div><p>${(local.q || local.nodo) ? 'No se encontraron clientes con esos filtros.' : 'Aún no hay clientes registrados.'}</p></div>`;
      return;
    }

    host.innerHTML = `
      <div class="bod-tbl-wrap"><table class="bod-tbl cli-tbl">
        <thead><tr><th>Cliente</th><th>Dirección</th><th>Servicio / Plan</th><th>Equipos</th><th>Estado</th><th class="ta-r">Acciones</th></tr></thead>
        <tbody>${list.map(filaCliente).join('')}</tbody>
      </table></div>
      <div class="muted-sm" style="padding:14px 4px 0">${list.length} cliente${list.length === 1 ? '' : 's'}${local.nodo ? ` · nodo: ${esc(local.nodo)}` : ''}${local.q ? ` · búsqueda: "${esc(local.q)}"` : ''}</div>`;

    const abrir = (key) => { const c = list.find((x) => x.key === key); if (c) abrirFicha(c, root); };
    host.querySelectorAll('tr[data-key]').forEach((tr) => (tr.onclick = () => abrir(tr.dataset.key)));
    host.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); abrir(b.dataset.ver); }));
  }

  paint();
  // Cargar servicios + inventario y volver a pintar (no bloquea la vista inicial).
  cargarServicios().then(() => paint());
  cargarInventario().then(() => paint());
}

/** Visita "fantasma" (solo en memoria) para abrir la misma ficha cuando el
 *  cliente solo existe como servicio (importado, sin visitas reales). */
function pseudoVisita(s) {
  s = s || {};
  return {
    _uid: 'svc-' + (s._uid || ''), id: '', cliente: s.nombre || 'Sin nombre',
    rut: s.rut || '', telefono: s.telefono || '', email: s.email || '', direccion: s.direccion || '',
    tecnico: '', estado: '', tipo: '', fecha: '', nodo: s.nodo || '',
  };
}

function abrirFicha(c, root) {
  const rep = c.rep || pseudoVisita(c.servicio);
  const opts = store.isCoordinador()
    ? { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) }
    : { onOrder: (x) => workOrderModal(x, store.company), readOnly: true };
  if (c.servicio) {
    opts.servicio = c.servicio;
    if (store.isCoordinador()) {
      opts.onEditServicio = (s) => editServicioModal(s, () => { svcCache.ts = 0; renderClientes(root); });
    }
  }
  clientCardModal(rep, opts);
}

function filaCliente(c) {
  const est = estadoCliente(c);
  const rut = c.rut ? formatRut(c.rut) : '';
  const svc = c.servicio;
  const plan = svc
    ? `📡 ${esc(svc.plan || 'Servicio')}${svc.ip ? `<div class="cell-sub">${esc(svc.ip)}</div>` : ''}`
    : '<span class="muted-sm">—</span>';
  const eqN = equiposDe(c.nombre);
  const eqCell = eqN
    ? `<span class="tag">📦 ${eqN} ${eqN === 1 ? 'equipo' : 'equipos'}</span>`
    : '<span class="muted-sm">0</span>';
  return `<tr data-key="${esc(c.key)}" style="cursor:pointer">
    <td>
      <div class="row" style="gap:10px;align-items:center">${clientAvatar(c.nombre)}
        <span style="min-width:0"><span class="cell-strong truncate" style="display:block">${esc(c.nombre)}</span>${rut ? `<span class="cell-sub">🪪 ${esc(rut)}</span>` : ''}</span></div>
    </td>
    <td class="cli-td-dir">${c.direccion ? esc(c.direccion) : '<span class="muted-sm">—</span>'}</td>
    <td>${plan}</td>
    <td>${eqCell}</td>
    <td>${tagEstado(est)}</td>
    <td class="ta-r"><button class="btn btn-sm" data-ver="${esc(c.key)}">Ver ficha</button></td>
  </tr>`;
}
