// ============================================================
// WIFIRED · Vista Calendario mensual
// ============================================================
import * as store from '../store.js';
import { esc, parseDate, toISO, todayISO, parseTecnico, bloqueShort } from '../util.js';
import { statusBadge, visitDetailModal, openModal, closeModal } from '../components.js';
import { visitFormModal } from '../form.js';
import { workOrderModal } from '../components.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS_DOT = {
  Pendiente: 'var(--st-pend-dot)', Programada: 'var(--st-prog-dot)',
  Completada: 'var(--st-comp-dot)', Reprogramada: 'var(--st-repr-dot)', Cancelada: 'var(--st-canc-dot)',
};

// mes visible (persiste durante la navegación)
const local = { y: null, m: null };

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
          ${shown.map((v) => `
            <button class="cal-ev" data-open="${esc(v._uid)}" title="${esc(v.cliente)} · ${esc(v.tipo)}">
              <span class="cal-ev-dot" style="background:${STATUS_DOT[v.estado] || '#94a3b8'}"></span>
              <span class="cal-ev-txt">${esc(bloqueShort(v.bloque))} · ${esc(v.cliente || v.tipo || 'Visita')}</span>
            </button>`).join('')}
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
  root.querySelector('[data-new]').onclick = () => visitFormModal();

  // abrir visita
  root.querySelectorAll('[data-open]').forEach((el) => (el.onclick = (e) => {
    e.stopPropagation();
    const v = store.byUid(el.dataset.open);
    if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
  }));

  // abrir día (celda o "+N más")
  const openDay = (iso) => dayModal(iso, byDate[iso] || []);
  root.querySelectorAll('[data-day-open]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); openDay(el.dataset.dayOpen); }));
  root.querySelectorAll('.cal-cell').forEach((el) => (el.onclick = () => openDay(el.dataset.day)));
}

// ---------- Modal de día ----------
function dayModal(iso, list) {
  const dt = parseDate(iso);
  const titulo = `${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dt.getDay()]} ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <h3>${esc(titulo)}</h3>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      ${list.length ? list.map((v) => {
        const t = parseTecnico(v.tecnico);
        return `<button class="day-row" data-open="${esc(v._uid)}">
          <span class="cal-ev-dot" style="background:${STATUS_DOT[v.estado] || '#94a3b8'}"></span>
          <span style="flex:1; min-width:0; text-align:left">
            <span class="cell-strong truncate" style="display:block">${esc(v.cliente || 'Sin nombre')}</span>
            <span class="cell-sub truncate" style="display:block">${esc(bloqueShort(v.bloque))} · ${esc(v.tipo || '—')}${v.tecnico ? ' · ' + esc(t.short) : ''}</span>
          </span>
          ${statusBadge(v.estado)}
        </button>`;
      }).join('') : '<p class="muted" style="padding:8px 0">No hay visitas este día.</p>'}
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cerrar</button>
      <button class="btn btn-primary" data-add>＋ Agregar visita este día</button>
    </div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  node.querySelector('[data-add]').onclick = () => { closeModal(); visitFormModal(null, { fecha: iso }); };
  node.querySelectorAll('[data-open]').forEach((el) => (el.onclick = () => {
    const v = store.byUid(el.dataset.open);
    closeModal();
    if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
  }));
  openModal(node, 'md');
}
