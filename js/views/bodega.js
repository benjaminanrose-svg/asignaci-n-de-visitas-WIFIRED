// ============================================================
// WIFIRED · Vista Bodega — inventario de equipos por código de serie
// Cada equipo (deco IPTV, router, etc.) se sigue por su código. Estados:
// bodega · tecnico (entregado) · instalado (en cliente) · baja. Con historial.
// Sólo coordinación.
// ============================================================
import * as store from '../store.js';
import { esc, toast } from '../util.js';
import { openModal, closeModal } from '../components.js';

const CATS = ['Deco IPTV', 'Router', 'Antena', 'ONU', 'Cable / Material', 'Otro'];
const EST = {
  bodega:    { l: 'En bodega',   emo: '📦', color: '#3a6098' },
  tecnico:   { l: 'Con técnico', emo: '🧑‍🔧', color: '#c79232' },
  instalado: { l: 'Instalado',   emo: '🏠', color: '#3f9d6d' },
  baja:      { l: 'De baja',     emo: '⛔', color: '#c14b4b' },
};
const estMeta = (e) => EST[e] || EST.bodega;

let items = [];              // cache del inventario
const local = { q: '', estado: '', categoria: '' };
// Vista por categorías: barra lateral de categorías + panel de productos de la seleccionada.

function chip(text, color) {
  return `<span class="tag" style="background:color-mix(in srgb, ${color} 16%, transparent); border-color:color-mix(in srgb, ${color} 40%, var(--border)); color:${color}">${text}</span>`;
}
function estadoChip(e) { const m = estMeta(e); return chip(`${m.emo} ${m.l}`, m.color); }
function fmtTs(ts) { try { return new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (x) { return ts || ''; } }

export async function renderBodega(root) {
  if (!store.isCoordinador()) { root.innerHTML = '<div class="empty-state">Sección sólo para coordinación.</div>'; return; }
  root.innerHTML = '<div class="empty-state"><div class="es-ico">📦</div>Cargando bodega…</div>';
  try { const r = await store.listInventario(); items = r.inventario || []; }
  catch (e) { root.innerHTML = `<div class="empty-state">No se pudo cargar la bodega. ${esc(e.message || '')}</div>`; return; }
  paint(root);
}

function paint(root) {
  const cont = (f) => items.filter(f).length;
  const pills = [
    { l: 'Total', n: items.length, c: '#55607a' },
    { l: 'En bodega', n: cont((i) => i.estado === 'bodega'), c: EST.bodega.color },
    { l: 'Con técnico', n: cont((i) => i.estado === 'tecnico'), c: EST.tecnico.color },
    { l: 'Instalados', n: cont((i) => i.estado === 'instalado'), c: EST.instalado.color },
    { l: 'De baja', n: cont((i) => i.estado === 'baja'), c: EST.baja.color },
  ];

  root.innerHTML = `
    <div class="section-head">
      <div><h2>📦 Bodega de equipos</h2><span class="muted-sm">Sigue cada equipo por su código: dónde está, con qué técnico o en qué cliente.</span></div>
      <button class="btn btn-primary" data-nuevo>＋ Nuevo equipo</button>
    </div>
    <div class="day-summary">
      ${pills.map((p) => `<div class="ds-pill"><span class="ds-dot" style="background:${p.c}"></span><span class="ds-n">${p.n}</span><span class="ds-l">${p.l}</span></div>`).join('')}
    </div>
    <div class="bod-layout">
      <div class="bod-cats" data-cats></div>
      <div class="bod-main">
        <div class="filters">
          <div class="search-box" style="width:280px;max-width:60vw">
            <span class="search-ico">⌕</span>
            <input type="search" data-q value="${esc(local.q)}" placeholder="Buscar por código, técnico o cliente…" autocomplete="off">
          </div>
          <select class="select" data-festado>
            <option value="">Todos los estados</option>
            ${Object.entries(EST).map(([k, m]) => `<option value="${k}" ${local.estado === k ? 'selected' : ''}>${m.emo} ${m.l}</option>`).join('')}
          </select>
        </div>
        <div data-lista></div>
      </div>
    </div>`;

  root.querySelector('[data-nuevo]').onclick = () => formModal(root, null);
  const q = root.querySelector('[data-q]');
  q.oninput = () => { local.q = q.value; pintarLista(root); };
  root.querySelector('[data-festado]').onchange = (e) => { local.estado = e.target.value; pintarLista(root); };
  pintarCats(root);
  pintarLista(root);
}

// Barra lateral de categorías: "Todas" + cada categoría con su cantidad de equipos.
function pintarCats(root) {
  const el = root.querySelector('[data-cats]');
  if (!el) return;
  const cats = [...new Set(items.map((i) => i.categoria || 'Otro'))].sort((a, b) => a.localeCompare(b, 'es'));
  const row = (val, label, n) => `
    <button class="bod-cat ${local.categoria === val ? 'active' : ''}" data-cat="${esc(val)}">
      <span>${label}</span><span class="bod-cat-n">${n}</span>
    </button>`;
  el.innerHTML = `<div class="bod-cats-t">Categorías</div>` +
    row('', 'Todas', items.length) +
    cats.map((c) => row(c, esc(c), items.filter((i) => (i.categoria || 'Otro') === c).length)).join('');
  el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => {
    local.categoria = b.dataset.cat;
    pintarCats(root);
    pintarLista(root);
  }));
}

function pintarLista(root) {
  const el = root.querySelector('[data-lista]');
  const qq = local.q.trim().toLowerCase();
  let list = items.filter((i) => {
    if (local.estado && i.estado !== local.estado) return false;
    if (local.categoria && i.categoria !== local.categoria) return false;
    if (qq) {
      const hay = `${i.codigo} ${i.categoria} ${i.descripcion} ${i.tecnico} ${i.cliente}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="es-ico">📦</div>${items.length ? 'Sin equipos con esos filtros.' : 'Aún no hay equipos. Agrega el primero con “＋ Nuevo equipo”.'}</div>`;
    return;
  }
  el.innerHTML = `<div class="cli-grid">${list.map(cardHtml).join('')}</div>`;
  el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => detailModal(root, b.dataset.open)));
}

function ubicacionTxt(i) {
  if (i.estado === 'tecnico') return `🧑‍🔧 ${esc(i.tecnico || 'técnico')}`;
  if (i.estado === 'instalado') return `🏠 ${esc(i.cliente || 'cliente')}${i.tecnico ? ` · por ${esc(i.tecnico)}` : ''}`;
  if (i.estado === 'baja') return '⛔ Dado de baja';
  return '📦 En bodega';
}

function cardHtml(i) {
  const m = estMeta(i.estado);
  return `
    <button class="card cli-card" data-open="${esc(i._uid)}" style="border-left:4px solid ${m.color}">
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
        ${chip(esc(i.categoria || 'Otro'), '#55607a')}
        ${estadoChip(i.estado)}
      </div>
      <div style="text-align:left;margin-top:10px">
        <div class="cell-strong" style="font-family:ui-monospace,Menlo,monospace;word-break:break-all">${esc(i.codigo)}</div>
        ${i.descripcion ? `<div class="cell-sub">${esc(i.descripcion)}</div>` : ''}
        <div class="cell-sub" style="margin-top:6px">${ubicacionTxt(i)}</div>
      </div>
    </button>`;
}

// ---------- Nuevo / editar ----------
function formModal(root, item) {
  const ed = !!item;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>${ed ? '✎ Editar equipo' : '＋ Nuevo equipo'}</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field full"><label>Código / serie *</label>
          <input class="input" data-f="codigo" value="${esc(item ? item.codigo : '')}" placeholder="Ej: HEXATEK251105394" autocomplete="off"></div>
        <div class="field"><label>Categoría</label>
          <input class="input" list="bod-cats" data-f="categoria" value="${esc(item ? item.categoria : 'Deco IPTV')}" autocomplete="off">
          <datalist id="bod-cats">${CATS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>Descripción / modelo</label>
          <input class="input" data-f="descripcion" value="${esc(item ? item.descripcion : '')}" placeholder="Ej: Deco Hexatek negro"></div>
        <div class="field full"><label>Nota (opcional)</label>
          <textarea class="textarea" data-f="nota" placeholder="Observaciones…">${esc(item ? item.nota : '')}</textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-x2>Cancelar</button><button class="btn btn-primary" data-save>${ed ? 'Guardar' : 'Agregar a bodega'}</button></div>`;
  node.querySelector('[data-x]').onclick = closeModal;
  node.querySelector('[data-x2]').onclick = closeModal;
  node.querySelector('[data-save]').onclick = async (e) => {
    const g = (k) => (node.querySelector(`[data-f="${k}"]`).value || '').trim();
    const codigo = g('codigo');
    if (!codigo) { toast('El código es obligatorio', 'info'); return; }
    const data = { codigo, categoria: g('categoria') || 'Otro', descripcion: g('descripcion'), nota: g('nota') };
    e.currentTarget.disabled = true;
    try {
      if (ed) await store.updateInventario(item._uid, data);
      else await store.addInventario(data);
      toast(ed ? 'Equipo actualizado ✓' : 'Equipo agregado a bodega ✓');
      closeModal(); renderBodega(root);
    } catch (err) { toast(err.message || 'No se pudo guardar', 'info'); e.currentTarget.disabled = false; }
  };
  openModal(node, 'md', { dismissable: false });
}

// ---------- Detalle + acciones ----------
function detailModal(root, uid) {
  const i = items.find((x) => x._uid === uid);
  if (!i) return;
  const m = estMeta(i.estado);
  const hist = Array.isArray(i.historial) ? i.historial.slice().reverse() : [];
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="row" style="gap:8px">${chip(esc(i.categoria || 'Otro'), '#55607a')}${estadoChip(i.estado)}</div>
        <h3 style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:16px;word-break:break-all">${esc(i.codigo)}</h3>
      </div>
      <button class="icon-btn" data-x>✕</button>
    </div>
    <div class="modal-body">
      <div class="detail-list" style="margin-bottom:8px">
        ${i.descripcion ? `<div class="detail-row"><span class="dl-k">Descripción</span><span class="dl-v">${esc(i.descripcion)}</span></div>` : ''}
        <div class="detail-row"><span class="dl-k">Ubicación actual</span><span class="dl-v">${ubicacionTxt(i)}</span></div>
        ${i.nota ? `<div class="detail-row"><span class="dl-k">Nota</span><span class="dl-v">${esc(i.nota)}</span></div>` : ''}
      </div>
      <div class="tk-section">
        <label class="tk-section-lbl">📜 Historial del equipo</label>
        ${hist.length ? `<div class="timeline">${hist.map((h) => `
          <div class="tl-item">
            <div class="tl-ico">${estMeta(h.estado).emo}</div>
            <div class="tl-body">
              <div class="tl-top"><strong>${esc(h.detalle || estMeta(h.estado).l)}</strong><span class="muted-sm">${esc(fmtTs(h.ts))}</span></div>
              ${h.nota ? `<div class="tl-note">${esc(h.nota)}</div>` : ''}
              ${h.por ? `<div class="muted-sm">por ${esc(h.por)}</div>` : ''}
            </div>
          </div>`).join('')}</div>` : '<div class="muted-sm">Sin movimientos aún.</div>'}
      </div>
    </div>
    <div class="modal-foot" style="justify-content:space-between">
      <button class="btn btn-danger btn-sm" data-del>Eliminar</button>
      <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">${acciones(i)}</div>
    </div>`;
  node.querySelector('[data-x]').onclick = closeModal;
  node.querySelector('[data-editar]') && (node.querySelector('[data-editar]').onclick = () => { closeModal(); formModal(root, i); });
  node.querySelector('[data-del]').onclick = async () => {
    if (!confirm(`¿Eliminar el equipo ${i.codigo}? Se borra su historial. Esta acción no se puede deshacer.`)) return;
    try { await store.deleteInventario(uid); toast('Equipo eliminado', 'info'); closeModal(); renderBodega(root); }
    catch (e) { toast(e.message || 'No se pudo eliminar', 'info'); }
  };
  node.querySelectorAll('[data-accion]').forEach((b) => (b.onclick = () => accionModal(root, i, b.dataset.accion)));
  openModal(node, 'md');
}

function acciones(i) {
  const b = (accion, label, primary) => `<button class="btn btn-sm ${primary ? 'btn-primary' : ''}" data-accion="${accion}">${label}</button>`;
  const editar = '<button class="btn btn-sm" data-editar>✎ Editar</button>';
  if (i.estado === 'bodega') return editar + b('entregar', '🧑‍🔧 Entregar a técnico', true) + b('baja', '⛔ Dar de baja');
  if (i.estado === 'tecnico') return editar + b('instalar', '🏠 Marcar instalado', true) + b('devolver', '📦 Devolver a bodega') + b('baja', '⛔ Dar de baja');
  if (i.estado === 'instalado') return editar + b('devolver', '📦 Devolver a bodega (retiro)', true) + b('baja', '⛔ Dar de baja');
  if (i.estado === 'baja') return editar + b('reingresar', '📦 Reingresar a bodega', true);
  return editar;
}

// Modal para pedir los datos de la acción (técnico / cliente / nota).
function accionModal(root, i, accion) {
  const tecnicos = store.tecnicos ? store.tecnicos() : [];
  const cfg = {
    entregar: { titulo: '🧑‍🔧 Entregar a técnico', pideTec: true },
    instalar: { titulo: '🏠 Marcar como instalado', pideCli: true },
    devolver: { titulo: '📦 Devolver a bodega' },
    reingresar: { titulo: '📦 Reingresar a bodega' },
    baja: { titulo: '⛔ Dar de baja' },
  }[accion];
  if (!cfg) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>${cfg.titulo}</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:10px">Equipo <b style="font-family:ui-monospace,Menlo,monospace">${esc(i.codigo)}</b></p>
      ${cfg.pideTec ? `<div class="field"><label>Técnico que lo recibe *</label>
        <select class="select" data-tec><option value="">— Elegir técnico —</option>${tecnicos.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>` : ''}
      ${cfg.pideCli ? `<div class="field"><label>Cliente / dirección donde se instaló</label>
        <input class="input" data-cli placeholder="Nombre del cliente o dirección" autocomplete="off"></div>` : ''}
      <div class="field" style="margin-top:10px"><label>Nota (opcional)</label>
        <textarea class="textarea" data-nota placeholder="Observación del movimiento…"></textarea></div>
    </div>
    <div class="modal-foot"><button class="btn" data-x2>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar</button></div>`;
  node.querySelector('[data-x]').onclick = closeModal;
  node.querySelector('[data-x2]').onclick = closeModal;
  node.querySelector('[data-ok]').onclick = async (e) => {
    const data = { accion };
    if (cfg.pideTec) { data.tecnico = (node.querySelector('[data-tec]').value || '').trim(); if (!data.tecnico) { toast('Elige el técnico', 'info'); return; } }
    if (cfg.pideCli) data.cliente = (node.querySelector('[data-cli]').value || '').trim();
    data.nota = (node.querySelector('[data-nota]').value || '').trim();
    e.currentTarget.disabled = true;
    try { await store.moverInventario(i._uid, data); toast('Movimiento registrado ✓'); closeModal(); renderBodega(root); }
    catch (err) { toast(err.message || 'No se pudo registrar', 'info'); e.currentTarget.disabled = false; }
  };
  openModal(node, 'md', { dismissable: false });
}
