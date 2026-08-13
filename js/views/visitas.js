// ============================================================
// WIFIRED · Vista Registro de Visitas (tabla + filtros)
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, fmtDateShort, bloqueShort, prioRank } from '../util.js';
import { statusBadge, priorityTag, techAvatar, clientAvatar, visitDetailModal, workOrderModal } from '../components.js';
import { visitFormModal } from '../form.js';

const local = { estado: '', tecnico: '', bloque: '', tipo: '', reagenda: false };

export function renderVisitas(root, ctx) {
  const search = (ctx && ctx.search) || '';

  root.innerHTML = `
    <div class="filters">
      <select class="select" data-f="estado">${optAll('Todos los estados', store.estados(), local.estado)}</select>
      <select class="select" data-f="tecnico">${optAll('Todos los técnicos', store.tecnicos(), local.tecnico, true)}</select>
      <select class="select" data-f="bloque">${optAll('Todos los bloques', store.bloques(), local.bloque)}</select>
      <select class="select" data-f="tipo">${optAll('Todos los tipos', store.tipos(), local.tipo)}</select>
      <button class="btn btn-sm ${local.reagenda ? 'btn-primary' : ''}" data-reagenda>⏳ Solicitudes de reagenda</button>
      <div class="grow"></div>
      <button class="btn btn-sm" data-clear>Limpiar filtros</button>
      <button class="btn btn-primary btn-sm" data-new>＋ Nueva visita</button>
    </div>
    <div class="card">
      <div id="table-host"></div>
    </div>`;

  root.querySelectorAll('[data-f]').forEach((sel) => {
    sel.onchange = () => { local[sel.dataset.f] = sel.value; paint(); };
  });
  root.querySelector('[data-reagenda]').onclick = () => { local.reagenda = !local.reagenda; renderVisitas(root, ctx); };
  root.querySelector('[data-clear]').onclick = () => {
    local.estado = local.tecnico = local.bloque = local.tipo = '';
    local.reagenda = false;
    renderVisitas(root, ctx);
  };
  root.querySelector('[data-new]').onclick = () => visitFormModal();

  const host = root.querySelector('#table-host');

  function paint() {
    let rows = store.visitas();
    if (local.estado) rows = rows.filter((v) => v.estado === local.estado);
    if (local.tecnico) rows = rows.filter((v) => (local.tecnico === '__none__' ? !v.tecnico : v.tecnico === local.tecnico));
    if (local.bloque) rows = rows.filter((v) => v.bloque === local.bloque);
    if (local.tipo) rows = rows.filter((v) => v.tipo === local.tipo);
    if (local.reagenda) rows = rows.filter((v) => v.reagenda_solicitada);
    rows = rows.slice().sort((a, b) => prioRank(a.prioridad) - prioRank(b.prioridad)); // prioridad primero
    if (search) {
      rows = rows.filter((v) =>
        [v.id, v.cliente, v.rut, v.telefono, v.direccion, v.tipo, v.tecnico, v.detalle]
          .some((f) => (f || '').toLowerCase().includes(search)));
    }

    if (!rows.length) {
      host.innerHTML = `<div class="empty-state"><div class="es-ico">🔍</div><p>No se encontraron visitas con estos criterios.</p></div>`;
      return;
    }

    host.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>OT</th><th>Cliente</th><th>Tipo</th><th>Fecha</th>
            <th>Bloque</th><th>Técnico</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>
    <div class="row-between" style="padding:12px 18px; border-top:1px solid var(--border-2)">
      <span class="muted-sm">${rows.length} visita${rows.length === 1 ? '' : 's'}${search ? ` · búsqueda: "${esc(search)}"` : ''}</span>
    </div>`;

    host.querySelectorAll('tbody tr').forEach((tr) => {
      tr.onclick = (e) => {
        const v = store.byUid(tr.dataset.uid);
        if (!v) return;
        if (e.target.closest('[data-ot]')) { workOrderModal(v, store.company); return; }
        visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
      };
    });
  }

  paint();
}

function rowHtml(v) {
  const t = parseTecnico(v.tecnico);
  return `
  <tr data-uid="${esc(v._uid)}">
    <td><span class="cell-id">${esc(v.id)}</span></td>
    <td>
      <div class="row" style="gap:10px">
        ${clientAvatar(v.cliente)}
        <div style="min-width:0">
          <div class="cell-strong truncate" style="max-width:200px">${esc(v.cliente || 'Sin nombre')}</div>
          <div class="cell-sub truncate" style="max-width:200px">${esc(v.direccion || v.rut || '—')}</div>
        </div>
      </div>
    </td>
    <td><span class="truncate" style="display:inline-block; max-width:180px">${esc(v.tipo || '—')}</span></td>
    <td class="nowrap">${esc(fmtDateShort(v.fecha))}</td>
    <td><span class="tag tag-block">${esc(bloqueShort(v.bloque))}</span></td>
    <td>${v.tecnico ? `<div class="row" style="gap:8px">${techAvatar(v.tecnico)}<span class="truncate" style="max-width:130px">${esc(t.short)}</span></div>` : '<span class="muted-sm">Sin asignar</span>'}</td>
    <td><div class="row" style="gap:6px; flex-wrap:wrap">${statusBadge(v.estado)}${priorityTag(v.prioridad)}</div></td>
    <td class="text-right"><button class="btn btn-sm btn-ghost" data-ot title="Orden de trabajo">🧾</button></td>
  </tr>`;
}

function optAll(label, list, sel, addNone) {
  let html = `<option value="">${esc(label)}</option>`;
  if (addNone) html += `<option value="__none__" ${sel === '__none__' ? 'selected' : ''}>Sin asignar</option>`;
  html += list.map((x) => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  return html;
}
