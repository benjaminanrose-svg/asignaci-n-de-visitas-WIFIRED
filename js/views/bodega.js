// ============================================================
// WIFIRED · Vista Bodega — inventario de equipos por código de serie
// Cada equipo (deco IPTV, router, etc.) se sigue por su código. Estados:
// bodega · tecnico (entregado) · instalado (en cliente) · baja. Con historial.
// Sólo coordinación.
// ============================================================
import * as store from '../store.js';
import { esc, toast, normName, clientKey, formatRut } from '../util.js';
import { openModal, closeModal } from '../components.js';

// Categorías estándar de equipos (única fuente de verdad para toda la vista).
const CATS = ['Antenas', 'Decos', 'Routers', 'Mesh (Repetidores)'];
const EST = {
  bodega:    { l: 'En bodega',   emo: '📦', color: '#3a6098' },
  tecnico:   { l: 'Con técnico', emo: '🧑‍🔧', color: '#c79232' },
  instalado: { l: 'Instalado',   emo: '🏠', color: '#3f9d6d' },
  baja:      { l: 'De baja',     emo: '⛔', color: '#c14b4b' },
};
const estMeta = (e) => EST[e] || EST.bodega;

// ── Motor de clasificación ────────────────────────────────────────────────
// Reglas por PREFIJO/patrón de código de serie (por fabricante). El ORDEN es la
// prioridad: lo más específico primero (ej. ZTEY=Mesh debe ganar a ZTE=Router).
const REGLAS_CODIGO = [
  // MESH (Repetidores / extensores Wi-Fi)
  ['Mesh (Repetidores)', /^(ZTEY|H196|HALO|DECO[-_]?[XME]|TL[-_]?WA|RE\d|COVR|EERO|TENDA|NOVA|MESH|EXT|REP)/],
  // ANTENAS (CPE inalámbricos / radioenlaces)
  ['Antenas', /^(UBNT|LBE|PBE|NBE|NSM|NS5|NS2|RBM|RP|LTU|AF|POWERBEAM|NANOSTATION|LITEBEAM|LHG|DISC|LDF|SXT|QRT|CAP|WAP|MANT|CAMB|EPMP|FORCE|MIMO|C5)/],
  // DECOS (IPTV / OTT / TV Box)
  ['Decos', /^(HEXATEK|HEXA|IPTV|MAG|STB|AMINO|SKY|KAON|ARRIS|TVBOX|OTT|DECO)/],
  // ROUTERS / ONTs
  ['Routers', /^(ZTEG|ZTEN|ZTE|HWTC|HG|EG|HN|48575443|TP[-_]?LINK|TPL|MERCUSYS|MC|RB|CCR|CRS|MIKROTIK|FHTT|ALCL|NOKIA|VSOL)/],
];

// Clasifica por el CÓDIGO de serie. Devuelve una de las 4 categorías, o null si
// el prefijo no aparece en ninguna lista.
function porCodigo(codigo) {
  const s = (codigo || '').toUpperCase().trim();
  if (!s) return null;
  for (const [cat, re] of REGLAS_CODIGO) if (re.test(s)) return cat;
  return null;
}

// Clasifica por el TEXTO de categoría (variantes escritas a mano). null si no calza.
function porTexto(cat) {
  const s = (cat || '').toLowerCase().trim();
  if (/antena/.test(s)) return 'Antenas';
  if (/mesh|repetidor/.test(s)) return 'Mesh (Repetidores)';
  if (/router|onu|ont/.test(s)) return 'Routers';
  if (/deco|decodific|iptv/.test(s)) return 'Decos';
  return null;
}

// Categoría final para AGRUPAR/MOSTRAR un equipo. REGLA DE INTEGRIDAD: siempre
// devuelve una de las 4 → ningún equipo queda fuera (suma sesiones = Total).
// Prioridad: código conocido → categoría canónica ya guardada → texto → 'Routers'.
function clasificar(item) {
  return porCodigo(item.codigo)
    || (CATS.includes(item.categoria) ? item.categoria : null)
    || porTexto(item.categoria)
    || 'Routers';
}

// Opciones del <select> de categoría: siempre las 4 estándar. Si se edita un
// equipo con una categoría antigua (fuera de la lista), se conserva como opción
// extra para no cambiarla sin querer al guardar.
function catOptions(sel) {
  const def = sel || 'Decos';
  const list = (sel && !CATS.includes(sel)) ? [sel, ...CATS] : CATS;
  return list.map((c) => `<option value="${esc(c)}" ${c === def ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

let items = [];              // cache del inventario
const local = { q: '', estado: '', cerradas: new Set() }; // filtros de la tabla
// Vista en acordeón: una sección por cada categoría estándar, con tabla de equipos.

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
  root.innerHTML = `
    <div class="section-head">
      <div><h2>📦 Bodega de equipos</h2><span class="muted-sm">Sigue cada equipo por su código: dónde está, con qué técnico o en qué cliente.</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" data-ingresar>📥 Ingresar equipos</button>
        <button class="btn" data-despachar>📤 Despachar a técnico</button>
        <button class="btn btn-primary" data-nuevo>＋ Nuevo equipo</button>
      </div>
    </div>
    <div class="day-summary" data-pills></div>
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
    <div class="bod-secciones" data-secciones></div>`;

  root.querySelector('[data-nuevo]').onclick = () => formModal(root, null);
  root.querySelector('[data-ingresar]').onclick = () => openScanner(root, 'ingreso');
  root.querySelector('[data-despachar]').onclick = () => openScanner(root, 'despacho');
  const q = root.querySelector('[data-q]');
  q.oninput = () => { local.q = q.value; pintarSecciones(root); };
  root.querySelector('[data-festado]').onchange = (e) => { local.estado = e.target.value; pintarSecciones(root); };
  pintarPills(root);
  pintarSecciones(root);
}

// Tarjetas de conteo (arriba). En función aparte para refrescarlas al escanear.
function pintarPills(root) {
  const el = root.querySelector('[data-pills]');
  if (!el) return;
  const cont = (f) => items.filter(f).length;
  const pills = [
    { l: 'Total', n: items.length, c: '#55607a' },
    { l: 'En bodega', n: cont((i) => i.estado === 'bodega'), c: EST.bodega.color },
    { l: 'Con técnico', n: cont((i) => i.estado === 'tecnico'), c: EST.tecnico.color },
    { l: 'Instalados', n: cont((i) => i.estado === 'instalado'), c: EST.instalado.color },
    { l: 'De baja', n: cont((i) => i.estado === 'baja'), c: EST.baja.color },
  ];
  el.innerHTML = pills.map((p) => `<div class="ds-pill"><span class="ds-dot" style="background:${p.c}"></span><span class="ds-n">${p.n}</span><span class="ds-l">${p.l}</span></div>`).join('');
}

// ---------- Escáner (drawer lateral: Ingreso o Despacho) ----------
// Sonido/animación suave de confirmación al escanear.
function beep(ok = true) {
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const a = new A(); const o = a.createOscillator(); const g = a.createGain();
    o.connect(g); g.connect(a.destination); o.type = 'sine'; o.frequency.value = ok ? 880 : 200;
    g.gain.value = 0.04; o.start(); setTimeout(() => { o.stop(); a.close(); }, 110);
  } catch (e) {}
}

// Abre el drawer del escáner en el modo indicado ('ingreso' | 'despacho').
function openScanner(root, modo) {
  const despacho = modo === 'despacho';
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = `
    <aside class="scan-drawer">
      <div class="scan-head">
        <div>
          <h3>${despacho ? '📤 Despachar a técnico' : '📥 Ingresar equipos'}</h3>
          <span class="muted-sm">${despacho ? 'Cada código se asigna al técnico elegido (Con técnico).' : 'Cada código entra al inventario (En bodega).'}</span>
        </div>
        <button class="icon-btn" data-close title="Cerrar">✕</button>
      </div>
      <div class="scan-body">
        ${despacho ? `<div class="field"><label>Técnico a quien se despacha *</label>
          <select class="select" data-tecsel><option value="">— Elige el técnico —</option>${(store.tecnicos ? store.tecnicos() : []).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>Escanea el código de serie</label>
          <input type="text" class="input scan-input" data-scan placeholder="Dispara con la pistola o escribe y Enter…" autocomplete="off" spellcheck="false" ${despacho ? 'disabled' : ''}></div>
        <div class="scan-badge" data-badge hidden></div>
        <div class="scan-adjust" data-adjust hidden></div>
        <div class="scan-counter" data-counter></div>
      </div>
      <div class="scan-foot">
        ${despacho ? '<button class="btn btn-primary" data-fin>Finalizar entrega</button>' : ''}
        <button class="btn" data-close>Cerrar</button>
      </div>
    </aside>`;
  document.body.appendChild(ov);

  const sc = { root, modo, drawer: ov, inp: ov.querySelector('[data-scan]'), tec: '', sesion: { tec: '', items: [] }, abierto: true };
  const cerrar = () => { sc.abierto = false; ov.remove(); };
  ov.querySelectorAll('[data-close]').forEach((b) => (b.onclick = cerrar));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) cerrar(); });

  const tecSel = ov.querySelector('[data-tecsel]');
  if (tecSel) tecSel.onchange = () => {
    sc.tec = tecSel.value;
    sc.inp.disabled = !sc.tec;
    if (sc.sesion.tec && sc.sesion.tec !== sc.tec) sc.sesion = { tec: '', items: [] };
    renderCounter(sc);
    if (sc.tec) sc.inp.focus();
  };

  sc.inp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const codigo = sc.inp.value.trim();
    if (!codigo) { sc.inp.value = ''; return; }
    if (despacho && !sc.tec) { badge(sc, 'Primero elige el técnico', false); return; }
    sc.inp.value = '';
    if (despacho) registrarDespacho(sc, codigo); else registrarEscaneo(sc, codigo);
  };
  // autoFocus fijo en el input mientras el drawer esté abierto.
  sc.inp.onblur = () => setTimeout(() => {
    if (!sc.abierto || sc.inp.disabled) return;
    const ae = document.activeElement;
    if (ov.contains(ae) && ae !== sc.inp) return; // permite usar el select o los botones
    if (document.getElementById('modal-root').children.length) return;
    sc.inp.focus();
  }, 60);

  const fin = ov.querySelector('[data-fin]');
  if (fin) fin.onclick = () => {
    const n = sc.sesion.items.length;
    sc.sesion = { tec: '', items: [] }; sc.tec = '';
    if (tecSel) tecSel.value = ''; sc.inp.disabled = true;
    renderCounter(sc);
    toast(`Entrega finalizada${n ? ` — ${n} equipo${n !== 1 ? 's' : ''}` : ''} ✓`);
  };

  renderCounter(sc);
  if (!despacho) sc.inp.focus();
}

// Badge verde (éxito) o rojo (aviso) con animación suave + sonido.
function badge(sc, txt, ok = true) {
  const b = sc.drawer.querySelector('[data-badge]'); if (!b) return;
  b.hidden = false;
  b.className = 'scan-badge ' + (ok ? 'ok' : 'err');
  b.textContent = txt;
  b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
  beep(ok);
}

// Suma un equipo a la sesión actual y refresca el contador.
function addSesion(sc, it) {
  if (sc.modo === 'despacho' && sc.sesion.tec !== sc.tec) sc.sesion = { tec: sc.tec, items: [] };
  sc.sesion.items.push({ codigo: it.codigo, cat: clasificar(it) });
  renderCounter(sc);
}

// Contador de equipos procesados en la sesión + desglose por categoría.
function renderCounter(sc) {
  const el = sc.drawer.querySelector('[data-counter]'); if (!el) return;
  const s = sc.sesion; const n = s.items.length;
  if (!n) { el.innerHTML = '<span class="muted-sm">Aún no escaneas equipos en esta sesión.</span>'; return; }
  const porCat = {}; s.items.forEach((x) => { porCat[x.cat] = (porCat[x.cat] || 0) + 1; });
  const desg = Object.entries(porCat).map(([c, k]) => `${k} ${c}`).join(', ');
  el.innerHTML = `<div class="scan-count-n">${n}</div><div class="scan-count-meta"><div class="scan-count-l">equipo${n !== 1 ? 's' : ''} ${sc.modo === 'despacho' ? `para ${esc(sc.sesion.tec)}` : 'ingresados'}</div><div class="muted-sm">${esc(desg)}</div></div>`;
}

// Reemplaza (o inserta) un equipo en la lista local por su _uid.
function upsertItem(it) {
  const i = items.findIndex((x) => x._uid === it._uid);
  if (i >= 0) items[i] = it; else items.unshift(it);
}

// ── MODO DESPACHO: entrega/creación+entrega/reasignación al escanear ──────────
async function registrarDespacho(sc, codigo) {
  const root = sc.root; const tec = sc.tec;
  const existente = items.find((x) => (x.codigo || '').toLowerCase() === codigo.toLowerCase());
  try {
    let it, msg;
    if (!existente) {
      // (b) No existe: crear (clasificando por prefijo) y entregar directo.
      const categoria = porCodigo(codigo) || 'Routers';
      const creado = await store.addInventario({ codigo, categoria });
      it = await store.moverInventario(creado._uid, { accion: 'entregar', tecnico: tec });
      msg = `✅ ${codigo} creado y entregado a ${tec}`;
    } else if (existente.estado === 'tecnico' && existente.tecnico === tec) {
      // Ya estaba con este mismo técnico: no se cuenta doble.
      badge(sc, `ℹ️ ${codigo} ya estaba con ${tec}`, false); return;
    } else if (existente.estado === 'tecnico' && existente.tecnico) {
      // (c) Estaba con OTRO técnico: reasignación.
      it = await store.moverInventario(existente._uid, { accion: 'entregar', tecnico: tec, nota: `Reasignado desde ${existente.tecnico}` });
      msg = `↺ ${codigo} reasignado de ${existente.tecnico} a ${tec}`;
    } else {
      // (a) Estaba en bodega (u otro estado): entregar al técnico.
      it = await store.moverInventario(existente._uid, { accion: 'entregar', tecnico: tec });
      msg = `✅ ${codigo} entregado a ${tec}`;
    }
    upsertItem(it);
    pintarPills(root); pintarSecciones(root);
    badge(sc, msg, true);
    addSesion(sc, it);
  } catch (e) { badge(sc, `⚠️ ${codigo}: ${e.message || 'no se pudo entregar'}`, false); }
}

// ── MODO INGRESO: crea el equipo en bodega y lo clasifica por código ──────────
async function registrarEscaneo(sc, codigo) {
  const root = sc.root;
  if (items.some((x) => (x.codigo || '').toLowerCase() === codigo.toLowerCase())) {
    badge(sc, `⚠️ ${codigo} ya está registrado`, false); return;
  }
  const categoria = porCodigo(codigo) || 'Routers'; // desconocido → Routers por defecto
  try {
    const it = await store.addInventario({ codigo, categoria });
    items.unshift(it);
    pintarPills(root); pintarSecciones(root);
    badge(sc, `✅ ${codigo} → ${categoria}`, true);
    addSesion(sc, it);
    mostrarAjuste(sc, it, categoria);
  } catch (e) { badge(sc, `⚠️ ${codigo}: ${e.message || 'no se pudo registrar'}`, false); }
}

// Selector rápido: tras escanear (ingreso), cambia la categoría del equipo con 1 clic.
function mostrarAjuste(sc, item, cat) {
  const el = sc.drawer.querySelector('[data-adjust]');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<span class="scan-adjust-l">Categoría: <b>${esc(cat)}</b> · cambiar:</span>`
    + CATS.map((c) => `<button class="btn btn-sm ${c === cat ? 'btn-primary' : ''}" data-setcat="${esc(c)}">${esc(c)}</button>`).join('');
  el.querySelectorAll('[data-setcat]').forEach((b) => (b.onclick = () => ajustarCategoria(sc, item, b.dataset.setcat)));
}

async function ajustarCategoria(sc, item, cat) {
  if (item.categoria === cat) return;
  try {
    await store.updateInventario(item._uid, { categoria: cat });
    item.categoria = cat;
    pintarPills(sc.root); pintarSecciones(sc.root);
    toast(`↺ ${item.codigo} movido a ${cat}`);
    mostrarAjuste(sc, item, clasificar(item));
    if (sc.inp && !sc.inp.disabled) sc.inp.focus();
  } catch (e) { toast(e.message || 'No se pudo cambiar la categoría', 'info'); }
}

// Acordeón: una sección por categoría estándar (siempre las 4), con su tabla.
function pasaFiltro(i) {
  if (local.estado && i.estado !== local.estado) return false;
  const qq = local.q.trim().toLowerCase();
  if (qq) {
    const hay = `${i.codigo} ${i.categoria} ${i.descripcion} ${i.tecnico} ${i.cliente}`.toLowerCase();
    if (!hay.includes(qq)) return false;
  }
  return true;
}

function pintarSecciones(root) {
  const el = root.querySelector('[data-secciones]');
  if (!el) return;
  el.innerHTML = CATS.map((cat) => {
    const list = items.filter((i) => clasificar(i) === cat && pasaFiltro(i));
    const abierta = !local.cerradas.has(cat);
    const cuerpo = list.length
      ? tablaHtml(list)
      : `<div class="bod-acc-empty muted-sm">Sin equipos en esta categoría${(local.q || local.estado) ? ' con esos filtros' : ''}.</div>`;
    return `
      <section class="bod-acc ${abierta ? 'open' : ''}">
        <button class="bod-acc-head" data-toggle="${esc(cat)}" aria-expanded="${abierta}">
          <span class="bod-acc-caret">▸</span>
          <span class="bod-acc-title">${esc(cat)}</span>
          <span class="bod-acc-total">Total: ${list.length}</span>
        </button>
        <div class="bod-acc-body"${abierta ? '' : ' hidden'}>${cuerpo}</div>
      </section>`;
  }).join('');
  el.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => {
    const c = b.dataset.toggle;
    if (local.cerradas.has(c)) local.cerradas.delete(c); else local.cerradas.add(c);
    pintarSecciones(root);
  }));
  el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => detailModal(root, b.dataset.open)));
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => formModal(root, items.find((x) => x._uid === b.dataset.edit))));
}

function tablaHtml(list) {
  return `<div class="bod-tbl-wrap"><table class="bod-tbl">
    <thead><tr><th>Código / Serie</th><th>Estado</th><th>Asignado a</th><th class="ta-r">Acciones</th></tr></thead>
    <tbody>${list.map(rowHtml).join('')}</tbody>
  </table></div>`;
}

function rowHtml(i) {
  return `<tr>
    <td class="bod-cod">${esc(i.codigo)}${i.descripcion ? `<span class="cell-sub">${esc(i.descripcion)}</span>` : ''}</td>
    <td>${estadoChip(i.estado)}</td>
    <td>${ubicacionTxt(i)}</td>
    <td class="ta-r"><button class="btn btn-sm" data-open="${esc(i._uid)}">Ver</button> <button class="btn btn-sm" data-edit="${esc(i._uid)}">Editar</button></td>
  </tr>`;
}

function ubicacionTxt(i) {
  if (i.estado === 'tecnico') return `🧑‍🔧 ${esc(i.tecnico || 'técnico')}`;
  if (i.estado === 'instalado') return `🏠 ${esc(i.cliente || 'cliente')}${i.tecnico ? ` · por ${esc(i.tecnico)}` : ''}`;
  if (i.estado === 'baja') return '⛔ Dado de baja';
  return '📦 En bodega';
}

// Índice de clientes (visitas + servicios) para el picker de instalación.
const svcCacheBodega = { list: [] };
function indexClientes(servicios) {
  const map = new Map();
  const add = (nombre, rut, telefono, direccion) => {
    const key = clientKey({ rut, telefono, nombre });
    if (!key) return;
    const prev = map.get(key);
    if (!prev) map.set(key, { key, nombre: nombre || '', rut: rut || '', direccion: direccion || '' });
    else { prev.nombre = prev.nombre || nombre || ''; prev.rut = prev.rut || rut || ''; prev.direccion = prev.direccion || direccion || ''; }
  };
  (store.visitas ? store.visitas() : []).forEach((v) => add(v.cliente, v.rut, v.telefono, v.direccion));
  (servicios || []).forEach((s) => add(s.nombre, s.rut, s.telefono, s.direccion));
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
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
          <select class="select" data-f="categoria">${catOptions(item ? item.categoria : '')}</select></div>
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
    const data = { codigo, categoria: g('categoria') || 'Decos', descripcion: g('descripcion'), nota: g('nota') };
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
      ${cfg.pideCli ? `<div class="field"><label>Cliente donde se instaló *</label>
        <input class="input" data-cliq placeholder="Buscar por nombre, RUT o dirección…" autocomplete="off">
        <div class="bod-cli-pick" data-clilist></div>
        <div class="bod-cli-sel" data-clisel hidden></div></div>` : ''}
      <div class="field" style="margin-top:10px"><label>Nota (opcional)</label>
        <textarea class="textarea" data-nota placeholder="Observación del movimiento…"></textarea></div>
    </div>
    <div class="modal-foot"><button class="btn" data-x2>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar</button></div>`;
  node.querySelector('[data-x]').onclick = closeModal;
  node.querySelector('[data-x2]').onclick = closeModal;

  let cliSel = null; // cliente elegido del picker
  if (cfg.pideCli) {
    const q = node.querySelector('[data-cliq]');
    const listEl = node.querySelector('[data-clilist]');
    const selEl = node.querySelector('[data-clisel]');
    let clientes = indexClientes(svcCacheBodega.list);
    const pintar = () => {
      const term = (q.value || '').toLowerCase().trim();
      const arr = (term ? clientes.filter((c) => `${c.nombre} ${c.rut} ${c.direccion}`.toLowerCase().includes(term)) : clientes).slice(0, 30);
      listEl.innerHTML = arr.length
        ? arr.map((c) => `<button type="button" class="bod-cli-opt" data-k="${esc(c.key)}"><span class="cell-strong">${esc(c.nombre)}</span><span class="cell-sub">${[c.rut ? formatRut(c.rut) : '', c.direccion].filter(Boolean).map(esc).join(' · ') || '—'}</span></button>`).join('')
        : '<div class="muted-sm" style="padding:8px 2px">Sin coincidencias — se guardará el texto tal cual.</div>';
      listEl.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        cliSel = clientes.find((c) => c.key === b.dataset.k);
        q.value = cliSel.nombre; selEl.hidden = false;
        selEl.textContent = `✓ ${cliSel.nombre}${cliSel.rut ? ' · ' + formatRut(cliSel.rut) : ''}`;
        listEl.innerHTML = '';
      }));
    };
    q.oninput = () => { cliSel = null; selEl.hidden = true; pintar(); };
    pintar();
    store.listServicios().then((r) => { svcCacheBodega.list = (r && r.servicios) || []; clientes = indexClientes(svcCacheBodega.list); if (node.isConnected) pintar(); }).catch(() => {});
  }

  node.querySelector('[data-ok]').onclick = async (e) => {
    const data = { accion };
    if (cfg.pideTec) { data.tecnico = (node.querySelector('[data-tec]').value || '').trim(); if (!data.tecnico) { toast('Elige el técnico', 'info'); return; } }
    if (cfg.pideCli) {
      data.cliente = cliSel ? cliSel.nombre : (node.querySelector('[data-cliq]').value || '').trim();
      if (!data.cliente) { toast('Elige o escribe el cliente', 'info'); return; }
    }
    data.nota = (node.querySelector('[data-nota]').value || '').trim();
    e.currentTarget.disabled = true;
    try { await store.moverInventario(i._uid, data); toast('Movimiento registrado ✓'); closeModal(); renderBodega(root); }
    catch (err) { toast(err.message || 'No se pudo registrar', 'info'); e.currentTarget.disabled = false; }
  };
  openModal(node, 'md', { dismissable: false });
}
