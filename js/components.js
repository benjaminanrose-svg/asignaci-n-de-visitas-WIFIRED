// ============================================================
// WIFIRED · Componentes de UI reutilizables + modales
// ============================================================
import { esc, parseTecnico, fmtDate, bloqueShort, colorFor, initials, telLink, waLink, todayISO, toast } from './util.js';
import { openPhoto } from './photos.js';
import * as store from './store.js';

/** Reagendar (coordinación): nueva fecha, resuelve la solicitud, conserva evidencia */
export function reagendarModal(v) {
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Reagendar visita</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:6px">${esc(v.id)} · ${esc(v.cliente || '')}</p>
      ${v.reagenda_solicitada ? `<div class="req-banner" style="margin-bottom:16px">⏳ <strong>Solicitud del técnico</strong><p>${esc(v.reagenda_motivo || 'Sin motivo')}</p>
        ${(v.evidencias || []).length || v.reagenda_motivo ? '<button class="btn btn-sm" data-download-ev style="margin-top:8px">⭳ Descargar evidencia</button>' : ''}
        <span style="display:block;margin-top:8px;font-size:11.5px">Al confirmar, la visita queda limpia (se elimina la evidencia).</span></div>` : ''}
      <div class="form-grid">
        <div class="field"><label>Nueva fecha</label><input class="input" type="date" name="fecha" value="${esc(v.fecha || todayISO())}"></div>
        <div class="field"><label>Bloque horario</label><select class="select" name="bloque">${store.bloques().map((b) => `<option ${b === v.bloque ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
        <div class="field"><label>Técnico</label><select class="select" name="tecnico"><option value="">Sin asignar</option>${store.tecnicos().map((t) => `<option ${t === v.tecnico ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="field"><label>Estado</label><select class="select" name="estado">${['Programada', 'Pendiente', 'Reprogramada'].map((s) => `<option ${s === 'Programada' ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Confirmar nueva fecha</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const dl = node.querySelector('[data-download-ev]');
  if (dl) dl.onclick = () => downloadEvidence(v);
  node.querySelector('[data-save]').onclick = () => {
    if ((v.evidencias || []).length && !confirm('Al reagendar se eliminará la evidencia de esta visita. Descárgala antes si la necesitas. ¿Continuar?')) return;
    store.updateVisita(v._uid, {
      fecha: node.querySelector('[name=fecha]').value,
      bloque: node.querySelector('[name=bloque]').value,
      tecnico: node.querySelector('[name=tecnico]').value,
      estado: node.querySelector('[name=estado]').value,
      reagenda_solicitada: '', reagenda_motivo: '', evidencias: '[]', // limpia por completo
    });
    toast('Visita reagendada'); closeModal();
  };
  openModal(node, 'md');
}

export function evidenceGallery(v) {
  const ev = v.evidencias || [];
  const nota = v.reagenda_motivo || v.detalle || '';
  if (!ev.length && !nota) return '';
  return `<div class="ev-block">
    <div class="ev-title">📎 Evidencia · ${ev.length} foto${ev.length === 1 ? '' : 's'}${nota ? ' + nota' : ''}</div>
    <button class="btn btn-sm" data-download-ev>⭳ Descargar evidencia</button>
  </div>`;
}

/** Descarga un archivo con la nota del técnico y las fotos (autocontenido) */
export function downloadEvidence(v) {
  const ev = v.evidencias || [];
  const nota = v.reagenda_motivo || v.detalle || '';
  const t = parseTecnico(v.tecnico);
  const row = (k, val) => `<div><b>${esc(k)}:</b> ${esc(val || '—')}</div>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Evidencia ${esc(v.id)}</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:26px auto;padding:0 18px;color:#111}
    h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:18px}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:26px 0 8px;border-bottom:1px solid #e2e2e2;padding-bottom:5px}
    .meta div{font-size:13px;margin:3px 0}.nota{white-space:pre-wrap;background:#f6f7f9;border:1px solid #eee;padding:12px 14px;border-radius:8px;font-size:13px}
    img{max-width:100%;border:1px solid #ccc;border-radius:8px;margin:6px 0}figure{margin:0 0 16px}figcaption{font-size:11px;color:#777;margin-bottom:4px}</style></head>
    <body>
      <h1>WIFIRED · Evidencia de visita</h1>
      <div class="sub">Generado el ${new Date().toLocaleString('es-CL')}</div>
      <div class="meta">
        ${row('Orden', v.id)} ${row('Cliente', v.cliente)} ${row('Técnico', t.name)}
        ${row('Estado', v.estado)} ${row('Fecha', (v.fecha || '') + ' ' + (v.bloque || ''))} ${row('Dirección', v.direccion)}
        ${v.reagenda_solicitada ? row('Motivo de reagenda', v.reagenda_motivo) : ''}
      </div>
      <h2>Nota del técnico</h2>
      <div class="nota">${esc(nota || 'Sin observaciones')}</div>
      <h2>Fotografías (${ev.length})</h2>
      ${ev.length ? ev.map((e, i) => `<figure><figcaption>Foto ${i + 1}${e.tipo ? ' · ' + esc(e.tipo) : ''}</figcaption><img src="${e.url}"></figure>`).join('') : '<p>Sin fotografías.</p>'}
    </body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `evidencia_${v.id}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
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
      ${v.reagenda_solicitada ? `<div class="req-banner">⏳ <strong>Solicitud de reagenda del técnico</strong><p>${esc(v.reagenda_motivo || 'Sin motivo indicado')}</p><span>Resuélvela con el botón “↻ Reagendar”.</span></div>` : ''}
      <div class="detail-list">
        <div class="detail-row"><span class="dl-k">Prioridad</span><span class="dl-v">${priorityTag(v.prioridad)}</span></div>
        <div class="detail-row"><span class="dl-k">Tipo de visita</span><span class="dl-v">${esc(v.tipo || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Fecha</span><span class="dl-v">${fmtDate(v.fecha, true)}</span></div>
        <div class="detail-row"><span class="dl-k">Bloque horario</span><span class="dl-v">${esc(v.bloque || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Técnico asignado</span><span class="dl-v row" style="gap:8px">${v.tecnico ? techAvatar(v.tecnico) + esc(t.name) : '<span class="muted">Sin asignar</span>'}</span></div>
        <div class="detail-row"><span class="dl-k">RUT</span><span class="dl-v">${esc(v.rut || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Teléfono</span><span class="dl-v">${esc(v.telefono || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Dirección</span><span class="dl-v">${v.direccion ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion + ', Melipilla, Chile')}" target="_blank" rel="noopener" style="color:var(--brand-500)">${esc(v.direccion)} · ver mapa ›</a>` : '—'}</span></div>
        <div class="detail-row"><span class="dl-k">Detalle / problema</span><span class="dl-v">${esc(v.detalle || '—')}</span></div>
        ${v.asignado_por ? `<div class="detail-row"><span class="dl-k">Asignado por</span><span class="dl-v">${esc(v.asignado_por)}</span></div>` : ''}
      </div>
      ${evidenceGallery(v)}
    </div>
    <div class="modal-foot">
      ${v.telefono ? `<a class="btn" href="${telLink(v.telefono)}">📞 Llamar</a>
      <a class="btn" style="color:#128c7e" target="_blank" rel="noopener" href="${waLink(v.telefono, `Hola ${v.cliente || ''}, le contactamos de WIFIRED por su visita técnica (${v.tipo || ''}).`)}">💬 WhatsApp</a>` : ''}
      <div class="grow"></div>
      <button class="btn" data-order>🧾 Orden</button>
      <button class="btn ${v.reagenda_solicitada ? 'btn-primary' : ''}" data-reagendar>↻ Reagendar</button>
      <button class="btn ${v.reagenda_solicitada ? '' : 'btn-primary'}" data-edit>✎ Editar</button>
    </div>`;
  node.querySelector('[data-close]').onclick = closeModal;
  node.querySelector('[data-edit]').onclick = () => { closeModal(); onEdit && onEdit(v); };
  node.querySelector('[data-order]').onclick = () => { closeModal(); onOrder && onOrder(v); };
  node.querySelector('[data-reagendar]').onclick = () => { closeModal(); reagendarModal(v); };
  const dlEv = node.querySelector('[data-download-ev]');
  if (dlEv) dlEv.onclick = () => downloadEvidence(v);
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
