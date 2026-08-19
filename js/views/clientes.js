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

export function renderClientes(root) {
  root.innerHTML = `
    <div class="hist-intro muted-sm">👥 Todos tus clientes en un solo lugar. Toca uno para ver su ficha con el historial completo de sus visitas.</div>
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
    let list = buildClientes();
    if (local.q) {
      list = list.filter((c) =>
        [c.nombre, c.rut, c.telefono, c.email, c.direccion]
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
      if (c) abrirFicha(c.rep);
    }));
  }

  paint();
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
  const badges = [
    chip(c.activas, 'activa', 'activas', 'var(--brand-500)'),
    chip(c.completadas, 'completada', 'completadas', 'var(--accent)'),
    chip(c.canceladas, 'cancelada', 'canceladas', 'var(--text-3)'),
  ].filter(Boolean).join(' ');
  return `
    <button class="card cli-card" data-key="${esc(c.key)}">
      <div class="row" style="gap:12px; align-items:flex-start">
        ${clientAvatar(c.nombre)}
        <div style="flex:1; min-width:0; text-align:left">
          <div class="cell-strong truncate">${esc(c.nombre)}</div>
          ${ident ? `<div class="cell-sub truncate">${ident}</div>` : ''}
          ${c.direccion ? `<div class="cell-sub truncate">📍 ${esc(c.direccion)}</div>` : ''}
        </div>
        <span class="cli-count">${c.total}</span>
      </div>
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-top:10px">
        ${badges || '<span class="muted-sm">Sin visitas activas</span>'}
      </div>
      <div class="cli-foot muted-sm">Última: ${esc(fmtDateShort(c.ultimaFecha) || '—')} · ${esc(parseTecnico(c.rep.tecnico).short || 'sin asignar')}</div>
    </button>`;
}
