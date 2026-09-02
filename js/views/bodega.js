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
// scan = escáner activo; modo = 'ingreso'|'despacho'; tec = técnico que recibe;
// sesion = resumen de entrega en curso { tec, items:[{codigo,cat}] }
const local = { q: '', estado: '', cerradas: new Set(), scan: false, modo: 'ingreso', tec: '', sesion: { tec: '', items: [] } };
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
      <div class="row" style="gap:8px">
        <button class="btn" data-scan-toggle>⚡ Modo escáner</button>
        <button class="btn btn-primary" data-nuevo>＋ Nuevo equipo</button>
      </div>
    </div>
    <div class="day-summary" data-pills></div>
    <div class="bod-scan" data-scanbox hidden>
      <div class="bod-scan-ico">⚡</div>
      <div class="bod-scan-main">
        <div class="bod-scan-modos">
          <button type="button" class="bod-modo-btn" data-modo="ingreso">📥 Modo ingreso</button>
          <button type="button" class="bod-modo-btn" data-modo="despacho">🚚 Modo despacho</button>
        </div>
        <div class="bod-scan-tec" data-tecwrap hidden>
          <label class="bod-scan-lbl">Técnico que recibe</label>
          <select class="select" data-tecsel>
            <option value="">— Elige el técnico —</option>
            ${(store.tecnicos ? store.tecnicos() : []).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <label class="bod-scan-lbl" data-scan-lbl>Modo escáner activo — dispara el código con la pistola</label>
        <input type="text" class="input bod-scan-inp" data-scan placeholder="Escanea o escribe el código y presiona Enter…" autocomplete="off" spellcheck="false">
        <span class="bod-scan-hint muted-sm" data-scan-hint>Se registra solo en bodega y se clasifica por el código.</span>
        <div class="bod-scan-adjust" data-scan-adjust hidden></div>
      </div>
      <button class="icon-btn" data-scan-close title="Cerrar modo escáner">✕</button>
    </div>
    <div class="bod-sesion" data-sesion hidden></div>
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
  const q = root.querySelector('[data-q]');
  q.oninput = () => { local.q = q.value; pintarSecciones(root); };
  root.querySelector('[data-festado]').onchange = (e) => { local.estado = e.target.value; pintarSecciones(root); };
  initScanner(root);
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

// ---------- Modo escáner (registro automático por código de barras) ----------
function initScanner(root) {
  const box = root.querySelector('[data-scanbox]');
  const inp = root.querySelector('[data-scan]');
  const toggle = root.querySelector('[data-scan-toggle]');
  const modalAbierto = () => !!document.getElementById('modal-root').children.length;
  const setOn = (on) => {
    local.scan = on;
    box.hidden = !on;
    toggle.classList.toggle('btn-primary', on);
    if (on) inp.focus();
  };
  toggle.onclick = () => setOn(!local.scan);
  root.querySelector('[data-scan-close]').onclick = () => setOn(false);

  // Selector de modo: Ingreso (crea en bodega) vs Despacho (entrega a técnico).
  root.querySelectorAll('[data-modo]').forEach((b) => (b.onclick = () => { local.modo = b.dataset.modo; pintarModo(root); inp.focus(); }));
  const sel = root.querySelector('[data-tecsel]');
  sel.onchange = () => {
    local.tec = sel.value;
    if (local.sesion.tec && local.sesion.tec !== local.tec) local.sesion = { tec: '', items: [] }; // técnico nuevo = sesión nueva
    pintarSesion(root);
    inp.focus();
  };

  // La pistola envía los caracteres y termina con Enter: ese es el disparador.
  inp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const codigo = inp.value.trim();
    if (!codigo) { inp.value = ''; return; }
    if (local.modo === 'despacho' && !local.tec) {
      toast('Primero elige el técnico que recibe', 'info');
      return; // no limpiar: deja el código a la vista para reintentar
    }
    inp.value = ''; // listo para el siguiente escaneo de inmediato
    if (local.modo === 'despacho') registrarDespacho(root, codigo);
    else registrarEscaneo(root, codigo);
  };
  // Mantener el foco mientras el modo esté activo (y no haya un modal abierto).
  inp.onblur = () => { if (local.scan && !modalAbierto()) setTimeout(() => { if (local.scan) inp.focus(); }, 40); };
  pintarModo(root);
  setOn(local.scan);
}

// Refleja el modo activo en la UI (botones, selector de técnico, textos).
function pintarModo(root) {
  const despacho = local.modo === 'despacho';
  root.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('is-on', b.dataset.modo === local.modo));
  const tw = root.querySelector('[data-tecwrap]'); if (tw) tw.hidden = !despacho;
  const lbl = root.querySelector('[data-scan-lbl]');
  if (lbl) lbl.textContent = despacho ? 'Escanea para ENTREGAR al técnico seleccionado' : 'Modo escáner activo — dispara el código con la pistola';
  const hint = root.querySelector('[data-scan-hint]');
  if (hint) hint.textContent = despacho ? 'El equipo pasa a "Con técnico". Si no existe, se crea y se entrega.' : 'Se registra solo en bodega y se clasifica por el código.';
  const adj = root.querySelector('[data-scan-adjust]'); if (adj) { adj.hidden = true; adj.innerHTML = ''; }
  pintarSesion(root);
}

// Reemplaza (o inserta) un equipo en la lista local por su _uid.
function upsertItem(it) {
  const i = items.findIndex((x) => x._uid === it._uid);
  if (i >= 0) items[i] = it; else items.unshift(it);
}

// ── MODO DESPACHO: entrega/creación+entrega/reasignación al escanear ──────────
async function registrarDespacho(root, codigo) {
  const hint = root.querySelector('[data-scan-hint]');
  const tec = local.tec;
  const existente = items.find((x) => (x.codigo || '').toLowerCase() === codigo.toLowerCase());
  try {
    let it, msg;
    if (!existente) {
      // (b) No existe: crear (clasificando por prefijo) y entregar directo.
      const categoria = porCodigo(codigo) || 'Routers';
      const creado = await store.addInventario({ codigo, categoria });
      it = await store.moverInventario(creado._uid, { accion: 'entregar', tecnico: tec });
      msg = `✅ ${codigo} creado y entregado a ${tec}`;
    } else if (existente.estado === 'tecnico' && existente.tecnico && existente.tecnico === tec) {
      // Ya estaba con este mismo técnico: no se hace nada (ni se cuenta doble).
      toast(`ℹ️ ${codigo} ya estaba con ${tec}`, 'info');
      if (hint) hint.textContent = `ℹ️ ${codigo} ya estaba con ${tec}.`;
      return;
    } else if (existente.estado === 'tecnico' && existente.tecnico && existente.tecnico !== tec) {
      // (c) Estaba con OTRO técnico: alerta de reasignación.
      it = await store.moverInventario(existente._uid, { accion: 'entregar', tecnico: tec, nota: `Reasignado desde ${existente.tecnico}` });
      toast(`⚠️ ${codigo} estaba con ${existente.tecnico} — reasignado a ${tec}`, 'info');
      msg = `↺ ${codigo} reasignado de ${existente.tecnico} a ${tec}`;
    } else {
      // (a) Estaba en bodega (u otro estado): entregar al técnico.
      it = await store.moverInventario(existente._uid, { accion: 'entregar', tecnico: tec });
      msg = `✅ ${codigo} entregado a ${tec}`;
    }
    upsertItem(it);
    addSesion(root, tec, it);
    pintarPills(root);
    pintarSecciones(root);
    toast(msg);
    if (hint) hint.textContent = `${msg}. Listo para el siguiente.`;
  } catch (e) {
    toast(e.message || `No se pudo entregar ${codigo}`, 'info');
    if (hint) hint.textContent = `⚠️ ${codigo}: ${e.message || 'no se pudo entregar'}.`;
  }
}

// Suma el equipo a la sesión de entrega en curso y refresca el panel flotante.
function addSesion(root, tec, it) {
  if (local.sesion.tec !== tec) local.sesion = { tec, items: [] };
  local.sesion.items.push({ codigo: it.codigo, cat: clasificar(it) });
  pintarSesion(root);
}

// Panel flotante: total y desglose por categoría + botón Finalizar entrega.
function pintarSesion(root) {
  const el = root.querySelector('[data-sesion]');
  if (!el) return;
  const s = local.sesion;
  if (local.modo !== 'despacho' || !s.tec || !s.items.length) { el.hidden = true; el.innerHTML = ''; return; }
  const porCat = {};
  s.items.forEach((x) => { porCat[x.cat] = (porCat[x.cat] || 0) + 1; });
  const desglose = Object.entries(porCat).map(([c, n]) => `${n} ${c}`).join(', ');
  const n = s.items.length;
  el.hidden = false;
  el.innerHTML = `
    <div class="bod-sesion-txt">📦 Entregando a <b>${esc(s.tec)}</b>: ${n} equipo${n !== 1 ? 's' : ''}
      <span class="muted-sm">(${esc(desglose)})</span></div>
    <button class="btn btn-sm btn-primary" data-fin>Finalizar entrega</button>`;
  el.querySelector('[data-fin]').onclick = () => finalizarEntrega(root);
}

// Cierra la sesión y prepara la herramienta para el siguiente técnico.
function finalizarEntrega(root) {
  const n = local.sesion.items.length;
  local.sesion = { tec: '', items: [] };
  local.tec = '';
  const sel = root.querySelector('[data-tecsel]'); if (sel) sel.value = '';
  pintarSesion(root);
  toast(`Entrega finalizada${n ? ` — ${n} equipo${n !== 1 ? 's' : ''}` : ''} ✓`);
  const inp = root.querySelector('[data-scan]'); if (inp && local.scan) inp.focus();
}

async function registrarEscaneo(root, codigo) {
  const hint = root.querySelector('[data-scan-hint]');
  // 1) Evitar duplicados (chequeo local instantáneo, insensible a mayúsculas).
  if (items.some((x) => (x.codigo || '').toLowerCase() === codigo.toLowerCase())) {
    toast(`⚠️ El código ${codigo} ya está registrado`, 'info');
    if (hint) hint.textContent = `⚠️ ${codigo} ya existía — no se duplicó.`;
    return;
  }
  const categoria = porCodigo(codigo) || 'Routers'; // desconocido → Routers por defecto
  try {
    // 2) Crear directo, estado inicial "En bodega" (lo pone el backend).
    const it = await store.addInventario({ codigo, categoria });
    items.unshift(it);
    pintarPills(root);
    pintarSecciones(root);
    // 3) Confirmación + selector rápido para ajustar la categoría a 1 clic.
    toast(`✅ ${codigo} registrado en ${categoria}`);
    if (hint) hint.textContent = `✅ Último: ${codigo} → ${categoria}. Listo para el siguiente.`;
    mostrarAjuste(root, it, categoria);
  } catch (e) {
    // El backend también valida duplicados/errores: se avisa sin romper el flujo.
    toast(e.message || `No se pudo registrar ${codigo}`, 'info');
    if (hint) hint.textContent = `⚠️ ${codigo}: ${e.message || 'no se pudo registrar'}.`;
  }
}

// Selector rápido: tras escanear, permite cambiar la categoría del equipo con 1 clic.
function mostrarAjuste(root, item, cat) {
  const el = root.querySelector('[data-scan-adjust]');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<span class="bod-scan-ok">✅ <b>${esc(item.codigo)}</b> → ${esc(cat)}</span>`
    + `<span class="bod-scan-chg">Cambiar:</span>`
    + CATS.map((c) => `<button class="btn btn-sm ${c === cat ? 'btn-primary' : ''}" data-setcat="${esc(c)}">${esc(c)}</button>`).join('');
  el.querySelectorAll('[data-setcat]').forEach((b) => (b.onclick = () => ajustarCategoria(root, item, b.dataset.setcat)));
}

async function ajustarCategoria(root, item, cat) {
  if (item.categoria === cat) return;
  try {
    await store.updateInventario(item._uid, { categoria: cat });
    item.categoria = cat;
    pintarPills(root);
    pintarSecciones(root);
    toast(`↺ ${item.codigo} movido a ${cat}`);
    mostrarAjuste(root, item, clasificar(item));
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
