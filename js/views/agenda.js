// ============================================================
// WIFIRED · Vista Agenda / Asignación (board con drag & drop)
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, fmtDate, addDays, todayISO, toast, prioRank } from '../util.js';
import { visitCard, techAvatar, visitDetailModal, workOrderModal } from '../components.js';
import { visitFormModal } from '../form.js';

// estado local de la vista (persiste durante la sesión de navegación)
const local = { date: null, mode: 'tecnico' };

export function renderAgenda(root) {
  if (!local.date) {
    // primera fecha con visitas activas, o hoy
    const vs = store.visitas().filter((v) => v.fecha).map((v) => v.fecha).sort();
    local.date = vs.find((d) => d >= todayISO()) || vs[vs.length - 1] || todayISO();
  }

  root.innerHTML = `
    <div class="board-toolbar">
      <div class="date-nav">
        <button class="icon-btn" data-nav="-1" title="Día anterior">‹</button>
        <input class="input" type="date" id="agenda-date" value="${esc(local.date)}" style="width:auto" />
        <button class="icon-btn" data-nav="1" title="Día siguiente">›</button>
        <button class="btn btn-sm" data-today>Hoy</button>
      </div>
      <div class="cur-date grow" style="text-align:left; padding-left:8px">${esc(fmtDate(local.date, true))}</div>
      <div class="seg" id="agenda-mode">
        <button data-mode="tecnico" class="${local.mode === 'tecnico' ? 'active' : ''}">Por técnico</button>
        <button data-mode="bloque" class="${local.mode === 'bloque' ? 'active' : ''}">Por bloque</button>
      </div>
      <button class="btn btn-primary btn-sm" data-new>＋ Nueva visita</button>
    </div>
    <div class="board" id="board"></div>`;

  // navegación
  root.querySelector('#agenda-date').onchange = (e) => { local.date = e.target.value; renderAgenda(root); };
  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { local.date = addDays(local.date, +b.dataset.nav); renderAgenda(root); }));
  root.querySelector('[data-today]').onclick = () => { local.date = todayISO(); renderAgenda(root); };
  root.querySelectorAll('#agenda-mode button').forEach((b) => (b.onclick = () => { local.mode = b.dataset.mode; renderAgenda(root); }));
  root.querySelector('[data-new]').onclick = () => visitFormModal(null, { fecha: local.date });

  const board = root.querySelector('#board');
  const dayVisits = store.visitas().filter((v) => v.fecha === local.date);

  if (local.mode === 'tecnico') buildByTech(board, dayVisits);
  else buildByBloque(board, dayVisits);

  wireBoard(board, root);
}

function colHead(inner, count, cls = '') {
  return `<div class="col-head ${cls}">${inner}<span class="count">${count}</span></div>`;
}

function buildByTech(board, dayVisits) {
  // columna "por asignar" (sin técnico)
  const unassigned = dayVisits.filter((v) => !v.tecnico);
  board.appendChild(makeCol('__none__',
    `<div><div class="ch-name">📥 Por asignar</div><div class="ch-role">Arrastra una visita a un técnico</div></div>`,
    unassigned, true));

  // una columna por técnico con visitas ese día (o técnicos con carga)
  store.tecnicos().forEach((tec) => {
    const list = dayVisits.filter((v) => v.tecnico === tec);
    const t = parseTecnico(tec);
    const head = `${techAvatar(tec)}<div><div class="ch-name">${esc(t.short)}</div><div class="ch-role">${esc(t.role)}</div></div>`;
    board.appendChild(makeCol(tec, head, list, false));
  });
}

function buildByBloque(board, dayVisits) {
  store.bloques().forEach((b) => {
    const list = dayVisits.filter((v) => v.bloque === b);
    const head = `<div><div class="ch-name">${esc(b)}</div><div class="ch-role">Bloque horario</div></div>`;
    board.appendChild(makeCol('bloque::' + b, head, list, false));
  });
  const sinB = dayVisits.filter((v) => !v.bloque);
  if (sinB.length) {
    board.appendChild(makeCol('bloque::', `<div><div class="ch-name">Sin bloque</div></div>`, sinB, true));
  }
}

function makeCol(key, headInner, list, unassigned) {
  list = list.slice().sort((a, b) => prioRank(a.prioridad) - prioRank(b.prioridad)); // mayor prioridad primero
  const col = document.createElement('div');
  col.className = 'col' + (unassigned ? ' is-unassigned' : '');
  col.dataset.col = key;
  col.innerHTML = colHead(headInner, list.length, '') +
    `<div class="col-body">${list.length ? list.map(visitCard).join('') : '<div class="col-empty">Sin visitas</div>'}</div>`;
  return col;
}

function wireBoard(board, root) {
  // abrir detalle
  board.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const v = store.byUid(el.dataset.open);
      if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
    });
  });

  // drag & drop
  let dragUid = null;
  board.querySelectorAll('.vcard').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragUid = card.dataset.uid;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragUid = null; });
  });

  board.querySelectorAll('.col-body').forEach((body) => {
    const col = body.closest('.col');
    body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drop-hint'); });
    body.addEventListener('dragleave', () => body.classList.remove('drop-hint'));
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.classList.remove('drop-hint');
      if (!dragUid) return;
      const v = store.byUid(dragUid);
      if (!v) return;
      const key = col.dataset.col;
      if (key.startsWith('bloque::')) {
        const b = key.slice(8);
        if (v.bloque === b) return;
        store.updateVisita(dragUid, { bloque: b });
        toast(`Movida a ${b || 'Sin bloque'}`);
      } else if (key === '__none__') {
        if (!v.tecnico) return;
        store.updateVisita(dragUid, { tecnico: '', estado: 'Pendiente' });
        toast('Visita marcada como pendiente');
      } else {
        if (v.tecnico === key) return;
        const patch = { tecnico: key };
        if (['Pendiente', ''].includes(v.estado) || !v.estado) patch.estado = 'Programada';
        store.updateVisita(dragUid, patch);
        toast(`Asignada a ${parseTecnico(key).short}`);
      }
      // el store dispara re-render de la vista actual
    });
  });
}
