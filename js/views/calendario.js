// ============================================================
// WIFIRED · Vista Calendario mensual
// ============================================================
import * as store from '../store.js';
import { esc, parseDate, toISO, todayISO, parseTecnico, bloqueShort, zonaDeVisita, ZONAS, toast } from '../util.js';
import { statusBadge, visitDetailModal, openModal, closeModal, visitCard, techAvatar } from '../components.js';
import { visitFormModal } from '../form.js';
import { workOrderModal } from '../components.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS_DOT = {
  Pendiente: 'var(--st-pend-dot)', Programada: 'var(--st-prog-dot)',
  Completada: 'var(--st-comp-dot)', Reprogramada: 'var(--st-repr-dot)', Cancelada: 'var(--st-canc-dot)',
};

// mes visible (persiste durante la navegación) + filtro de zona ('', 'melipilla', 'paine')
const local = { y: null, m: null, zona: '' };

// Insignia de zona (usada en el modal diario).
function zonaBadge(v) {
  const z = zonaDeVisita(v);
  if (!z) return '';
  return `<span class="zona-badge" style="color:${z.color};border-color:color-mix(in srgb, ${z.color} 45%, var(--border));background:color-mix(in srgb, ${z.color} 15%, transparent)">📍 ${z.label}</span>`;
}

export function renderCalendario(root) {
  if (local.y === null) {
    // primer mes con visitas, o el mes actual
    const fechas = store.visitas().map((v) => v.fecha).filter(Boolean).sort();
    const base = fechas.length ? parseDate(fechas[fechas.length - 1]) : new Date();
    local.y = base.getFullYear();
    local.m = base.getMonth();
  }

  const { y, m } = local;
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes = 0
  const gridStart = new Date(y, m, 1 - startOffset);

  // Agrupar visitas por fecha
  const byDate = {};
  store.visitas().forEach((v) => {
    if (!v.fecha) return;
    (byDate[v.fecha] = byDate[v.fecha] || []).push(v);
  });

  const today = todayISO();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = toISO(d);
    const inMonth = d.getMonth() === m;
    const list = (byDate[iso] || []).slice().sort((a, b) => (a.bloque || '').localeCompare(b.bloque || ''));
    const isToday = iso === today;
    const shown = list.slice(0, 3);
    const extra = list.length - shown.length;

    cells.push(`
      <div class="cal-cell ${inMonth ? '' : 'out'} ${isToday ? 'today' : ''}" data-day="${iso}">
        <div class="cal-daynum">${d.getDate()}${isToday ? '<span class="cal-todaydot"></span>' : ''}</div>
        <div class="cal-events">
          ${shown.map((v) => {
            const z = zonaDeVisita(v);
            const dim = local.zona && (!z || z.key !== local.zona) ? ' cal-ev--dim' : '';
            return `
            <button class="cal-ev${dim}" data-open="${esc(v._uid)}" data-zona="${z ? z.key : ''}" title="${esc(v.cliente)} · ${esc(v.tipo)}${z ? ' · ' + z.label : ''}" ${z ? `style="border-left:3px solid ${z.color}"` : ''}>
              <span class="cal-ev-dot" style="background:${STATUS_DOT[v.estado] || '#94a3b8'}"></span>
              <span class="cal-ev-txt">${z ? `📍 ${z.abbr} · ` : ''}${esc(bloqueShort(v.bloque))} · ${esc(v.cliente || v.tipo || 'Visita')}</span>
            </button>`;
          }).join('')}
          ${extra > 0 ? `<button class="cal-more" data-day-open="${iso}">+${extra} más</button>` : ''}
        </div>
      </div>`);
  }

  // resumen del mes
  const monthVisits = store.visitas().filter((v) => {
    const dt = parseDate(v.fecha); return dt && dt.getFullYear() === y && dt.getMonth() === m;
  });

  root.innerHTML = `
    <div class="board-toolbar">
      <div class="date-nav">
        <button class="icon-btn" data-nav="-1" title="Mes anterior">‹</button>
        <div class="cur-date">${MESES[m]} ${y}</div>
        <button class="icon-btn" data-nav="1" title="Mes siguiente">›</button>
        <button class="btn btn-sm" data-today>Hoy</button>
      </div>
      <div class="grow"></div>
      <div class="cal-legend">
        ${Object.entries(STATUS_DOT).map(([k, c]) => `<span class="cal-lg"><span class="sw" style="background:${c}"></span>${k}</span>`).join('')}
      </div>
      <div class="cal-zonas">
        <button class="cal-zbtn ${!local.zona ? 'is-on' : ''}" data-zona-f="">Todas las zonas</button>
        <button class="cal-zbtn ${local.zona === 'melipilla' ? 'is-on' : ''}" data-zona-f="melipilla" style="--z:${ZONAS.melipilla.color}">📍 Melipilla</button>
        <button class="cal-zbtn ${local.zona === 'paine' ? 'is-on' : ''}" data-zona-f="paine" style="--z:${ZONAS.paine.color}">📍 Paine</button>
      </div>
      <button class="btn btn-primary btn-sm" data-new>＋ Nueva visita</button>
    </div>

    <div class="card" style="overflow:hidden">
      <div class="cal-grid cal-head">${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}</div>
      <div class="cal-grid cal-body">${cells.join('')}</div>
    </div>
    <p class="muted-sm" style="margin-top:12px">${monthVisits.length} visita${monthVisits.length === 1 ? '' : 's'} en ${MESES[m]} ${y}</p>`;

  // navegación
  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => {
    let nm = local.m + Number(b.dataset.nav);
    if (nm < 0) { nm = 11; local.y--; } else if (nm > 11) { nm = 0; local.y++; }
    local.m = nm; renderCalendario(root);
  }));
  root.querySelector('[data-today]').onclick = () => {
    const n = new Date(); local.y = n.getFullYear(); local.m = n.getMonth(); renderCalendario(root);
  };
  root.querySelectorAll('[data-zona-f]').forEach((b) => (b.onclick = () => { local.zona = b.dataset.zonaF; renderCalendario(root); }));
  root.querySelector('[data-new]').onclick = () => visitFormModal();

  // abrir visita
  root.querySelectorAll('[data-open]').forEach((el) => (el.onclick = (e) => {
    e.stopPropagation();
    const v = store.byUid(el.dataset.open);
    if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
  }));

  // abrir día (celda o "+N más")
  const openDay = (iso) => dayModal(iso);
  root.querySelectorAll('[data-day-open]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); openDay(el.dataset.dayOpen); }));
  root.querySelectorAll('.cal-cell').forEach((el) => (el.onclick = () => openDay(el.dataset.day)));
}

// ---------- Modal de día (columnas por técnico, estilo Asignación) ----------
function dayModal(iso) {
  const dt = parseDate(iso);
  const titulo = `${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dt.getDay()]} ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <h3>${esc(titulo)}</h3>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body"><div class="board board-modal" data-daycols></div></div>
    <div class="modal-foot">
      <button class="btn" data-close>Cerrar</button>
      <button class="btn btn-primary" data-add>＋ Agregar visita este día</button>
    </div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  node.querySelector('[data-add]').onclick = () => { closeModal(); visitFormModal(null, { fecha: iso }); };
  renderDayCols(node.querySelector('[data-daycols]'), iso);
  openModal(node, 'xl');
}

// Construye (y reconstruye) las columnas por técnico dentro del modal de día.
function renderDayCols(cont, iso) {
  const dia = store.visitas().filter((v) => v.fecha === iso);
  if (!dia.length) { cont.innerHTML = '<p class="muted" style="padding:8px 0">No hay visitas este día.</p>'; return; }
  const tecnicos = store.tecnicos();
  // "Por asignar" solo aparece si hay al menos 1 visita sin técnico ese día.
  const unassigned = dia.filter((v) => !v.tecnico);
  const cols = [];
  if (unassigned.length) cols.push({ key: '', un: true, list: unassigned, head: '<div class="ch-meta"><div class="ch-name">📥 Por asignar</div><div class="ch-role">Reasigna con el selector ▾</div></div>' });
  tecnicos.forEach((tec) => {
    const l = dia.filter((v) => v.tecnico === tec);
    if (!l.length) return; // solo técnicos con visitas ese día (el selector permite mover a cualquiera)
    const t = parseTecnico(tec);
    const done = l.filter((v) => v.estado === 'Completada').length;
    cols.push({ key: tec, list: l, head: `${techAvatar(tec)}<div class="ch-meta"><div class="ch-name">${esc(t.short)}</div><div class="ch-role">${done}/${l.length} completada${done === 1 ? '' : 's'}</div></div>` });
  });
  const optTec = (sel) => tecnicos.map((t) => `<option value="${esc(t)}" ${t === sel ? 'selected' : ''}>${esc(parseTecnico(t).short)}</option>`).join('');
  cont.innerHTML = cols.map((c) => `
    <div class="col${c.un ? ' is-unassigned' : ''}">
      <div class="col-head">${c.head}<span class="count">${c.list.length}</span></div>
      <div class="col-body">${c.list.length ? c.list.map((v) => `
        <div class="daycol-card">
          ${visitCard(v)}
          <label class="daycol-reasign">Asignar a:
            <select class="select" data-reasign="${esc(v._uid)}"><option value="">— Por asignar —</option>${optTec(v.tecnico)}</select>
          </label>
        </div>`).join('') : `<div class="col-empty">${c.un ? '✓ Nada por asignar' : 'Sin visitas'}</div>`}
      </div>
    </div>`).join('');

  // Abrir detalle al tocar la tarjeta.
  cont.querySelectorAll('[data-open]').forEach((el) => (el.onclick = () => {
    const v = store.byUid(el.dataset.open);
    closeModal();
    if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
  }));
  // Reasignación rápida con el selector (no cierra el modal; reconstruye columnas).
  cont.querySelectorAll('[data-reasign]').forEach((sel) => (sel.onchange = async (e) => {
    e.stopPropagation();
    const v = store.byUid(sel.dataset.reasign);
    if (!v) return;
    const tec = sel.value;
    if (tec === (v.tecnico || '')) return;
    const patch = { tecnico: tec };
    if (!tec) patch.estado = 'Pendiente';
    else if (['Pendiente', ''].includes(v.estado) || !v.estado) patch.estado = 'Programada';
    try {
      await store.updateVisita(v._uid, patch);
      toast(tec ? `Asignada a ${parseTecnico(tec).short}` : 'Marcada por asignar');
      renderDayCols(cont, iso);
    } catch (err) { toast(err.message || 'No se pudo reasignar', 'info'); }
  }));
}
