// ============================================================
// WIFIRED · Componentes de UI reutilizables + modales
// ============================================================
import { esc, parseTecnico, fmtDate, bloqueShort, colorFor, initials } from './util.js';
import { openPhoto } from './photos.js';

export function evidenceGallery(v) {
  const ev = v.evidencias || [];
  if (!ev.length) return '';
  return `<div class="ev-block"><div class="ev-title">📷 Evidencia fotográfica (${ev.length})</div>
    <div class="ev-grid">${ev.map((e, i) => `<img class="ev-thumb" data-photo="${i}" src="${e.url}" alt="evidencia">`).join('')}</div></div>`;
}

export function statusBadge(estado) {
  return `<span class="badge st-${esc(estado)}"><span class="dot"></span>${esc(estado || '—')}</span>`;
}

export function priorityTag(p) {
  p = p || 'Media';
  const cls = { Alta: 'pr-alta', Media: 'pr-media', Baja: 'pr-baja' }[p] || 'pr-media';
  return `<span class="prio ${cls}">⚑ ${esc(p)}</span>`;
}

export function techAvatar(full, cls = 'avatar-sm') {
  const t = parseTecnico(full);
  return `<span class="${cls}" style="background:${t.color}">${esc(t.initials)}</span>`;
}

export function clientAvatar(name) {
  return `<span class="avatar-sm" style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:11px;background:${colorFor(name)}">${esc(initials(name))}</span>`;
}

/** Tarjeta de visita para el board */
export function visitCard(v) {
  const t = parseTecnico(v.tecnico);
  const addr = v.direccion ? `<div class="vc-addr"><span>📍</span><span class="truncate">${esc(v.direccion)}</span></div>` : '';
  return `
  <div class="vcard b-${esc(v.estado)}" draggable="true" data-uid="${esc(v._uid)}" data-open="${esc(v._uid)}">
    <div class="vc-top">
      <span class="vc-id">${esc(v.id)}</span>
      <span class="row" style="gap:5px">${priorityTag(v.prioridad)}<span class="tag tag-block">${esc(bloqueShort(v.bloque))}</span></span>
    </div>
    <div class="vc-client">${esc(v.cliente || 'Sin nombre')}</div>
    <div class="vc-type">${esc(v.tipo || '—')}</div>
    ${addr}
    <div class="vc-foot">${statusBadge(v.estado)}${v.reagenda_solicitada ? '<span class="tag" style="color:var(--st-repr-fg)">⏳ reagenda</span>' : ''}${(v.evidencias || []).length ? `<span class="tag">📷 ${v.evidencias.length}</span>` : ''}</div>
  </div>`;
}

// ---------------- Modal system ----------------
export function openModal(node, size = 'md') {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = `modal ${size}`;
  modal.appendChild(node);
  overlay.appendChild(modal);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', escClose);
  root.appendChild(overlay);
  return overlay;
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
export function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  document.removeEventListener('keydown', escClose);
}

// ---------------- Detalle de visita ----------------
export function visitDetailModal(v, { onEdit, onOrder } = {}) {
  const t = parseTecnico(v.tecnico);
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="row" style="gap:10px">
          <span class="cell-id" style="font-size:14px">${esc(v.id)}</span>
          ${statusBadge(v.estado)}
        </div>
        <h3 style="margin-top:6px">${esc(v.cliente || 'Sin nombre')}</h3>
      </div>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      ${v.reagenda_solicitada ? `<div class="req-banner">⏳ <strong>Solicitud de reagenda</strong><p>${esc(v.reagenda_motivo || 'Sin motivo indicado')}</p><span>Asigna una nueva fecha con “Editar / Asignar”.</span></div>` : ''}
      <div class="detail-list">
        <div class="detail-row"><span class="dl-k">Prioridad</span><span class="dl-v">${priorityTag(v.prioridad)}</span></div>
        <div class="detail-row"><span class="dl-k">Tipo de visita</span><span class="dl-v">${esc(v.tipo || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Fecha</span><span class="dl-v">${fmtDate(v.fecha, true)}</span></div>
        <div class="detail-row"><span class="dl-k">Bloque horario</span><span class="dl-v">${esc(v.bloque || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Técnico asignado</span><span class="dl-v row" style="gap:8px">${v.tecnico ? techAvatar(v.tecnico) + esc(t.name) : '<span class="muted">Sin asignar</span>'}</span></div>
        <div class="detail-row"><span class="dl-k">RUT</span><span class="dl-v">${esc(v.rut || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Teléfono</span><span class="dl-v">${esc(v.telefono || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Dirección</span><span class="dl-v">${esc(v.direccion || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Detalle / problema</span><span class="dl-v">${esc(v.detalle || '—')}</span></div>
        ${v.asignado_por ? `<div class="detail-row"><span class="dl-k">Asignado por</span><span class="dl-v">${esc(v.asignado_por)}</span></div>` : ''}
      </div>
      ${evidenceGallery(v)}
    </div>
    <div class="modal-foot">
      <button class="btn" data-order>🧾 Orden de trabajo</button>
      <button class="btn btn-primary" data-edit>✎ Editar / Asignar</button>
    </div>`;
  node.querySelector('[data-close]').onclick = closeModal;
  node.querySelector('[data-edit]').onclick = () => { closeModal(); onEdit && onEdit(v); };
  node.querySelector('[data-order]').onclick = () => { closeModal(); onOrder && onOrder(v); };
  node.querySelectorAll('[data-photo]').forEach((img) => (img.onclick = () => openPhoto((v.evidencias || [])[img.dataset.photo].url)));
  openModal(node, 'md');
}

// ---------------- Orden de trabajo imprimible ----------------
export function workOrderModal(v, company) {
  const t = parseTecnico(v.tecnico);
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <h3>Orden de trabajo · ${esc(v.id)}</h3>
      <div class="row">
        <button class="btn btn-primary btn-sm" data-print>🖨 Imprimir</button>
        <button class="icon-btn" data-close>✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="ot-doc">
        <div class="ot-header">
          <div class="ot-co">
            <h4>${esc(company.nombre)}</h4>
            <p>${esc(company.direccion)}</p>
            <p>${esc(company.fonos.join(' · '))} · ${esc(company.email)}</p>
          </div>
          <div class="ot-otn">
            <div class="lbl">N° ORDEN</div>
            <div class="num">${esc(v.id)}</div>
          </div>
        </div>
        <div class="ot-grid">
          <div class="ot-f"><div class="k">Nombre del cliente</div><div class="v">${esc(v.cliente || '—')}</div></div>
          <div class="ot-f"><div class="k">RUT / ID cliente</div><div class="v">${esc(v.rut || '—')}</div></div>
          <div class="ot-f"><div class="k">Teléfono</div><div class="v">${esc(v.telefono || '—')}</div></div>
          <div class="ot-f"><div class="k">Técnico asignado</div><div class="v">${esc(t.name)}</div></div>
          <div class="ot-f"><div class="k">Fecha prevista</div><div class="v">${fmtDate(v.fecha, true)}</div></div>
          <div class="ot-f"><div class="k">Bloque horario</div><div class="v">${esc(v.bloque || '—')}</div></div>
          <div class="ot-f"><div class="k">Prioridad</div><div class="v">${esc(v.prioridad || 'Media')}</div></div>
          <div class="ot-f" style="grid-column:1/-1"><div class="k">Dirección del cliente</div><div class="v">${esc(v.direccion || '—')}</div></div>
          <div class="ot-f" style="grid-column:1/-1"><div class="k">Trabajo / descripción</div><div class="v">${esc(v.tipo || '—')}</div></div>
          <div class="ot-f" style="grid-column:1/-1"><div class="k">Comentarios adicionales</div><div class="v">${esc(v.detalle || '—')}</div></div>
          <div class="ot-f"><div class="k">Trabajos autorizados por</div><div class="v">${esc(company.autoriza)}</div></div>
          <div class="ot-f"><div class="k">Estado</div><div class="v">${esc(v.estado || '—')}</div></div>
        </div>
        <div class="ot-sign">
          <div class="sig">Firma del cliente</div>
          <div class="sig">Firma del técnico</div>
        </div>
        <p class="ot-legal">Con mi firma, declaro recibir conforme el servicio técnico contratado, validando que la instalación (cableado, perforaciones y canalizado) se realizó a mi entera satisfacción. Asimismo, constato que los equipos quedan operativos, con los parámetros de navegación (velocidad y señal Wi-Fi) verificados y aceptados en mi presencia.</p>
      </div>
    </div>`;
  node.querySelector('[data-close]').onclick = closeModal;
  node.querySelector('[data-print]').onclick = () => window.print();
  openModal(node, 'lg');
}
