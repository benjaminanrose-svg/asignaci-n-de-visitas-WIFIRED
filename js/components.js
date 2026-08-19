// ============================================================
// WIFIRED · Componentes de UI reutilizables + modales
// ============================================================
import { esc, parseTecnico, fmtDate, bloqueShort, colorFor, initials, telLink, waLink, todayISO, toast } from './util.js';
import { openPhoto } from './photos.js';
import { downloadZip, dataUriToBytes } from './zip.js';
import * as store from './store.js';

/** Reagendar (coordinación): nueva fecha, resuelve la solicitud, conserva evidencia */
export function reagendarModal(v) {
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Reagendar visita</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:6px">${esc(v.id)} · ${esc(v.cliente || '')}</p>
      ${v.reagenda_solicitada ? `<div class="req-banner" style="margin-bottom:16px">⏳ <strong>Solicitud del técnico</strong><p>${esc(v.reagenda_motivo || 'Sin motivo')}</p>
        ${(v.evidencias || []).length || v.reagenda_motivo ? '<button class="btn btn-sm" data-zip style="margin-top:8px">⭳ Descargar historial (ZIP)</button>' : ''}</div>` : ''}
      <div class="form-grid">
        <div class="field"><label>Nueva fecha</label><input class="input" type="date" name="fecha" value="${esc(v.fecha || todayISO())}"></div>
        <div class="field"><label>Bloque horario</label><select class="select" name="bloque">${store.bloques().map((b) => `<option ${b === v.bloque ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
        <div class="field"><label>Técnico</label><select class="select" name="tecnico"><option value="">Sin asignar</option>${store.tecnicos().map((t) => `<option ${t === v.tecnico ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="field"><label>Estado</label><select class="select" name="estado">${['Reprogramada', 'Programada', 'Pendiente'].map((s) => `<option ${s === 'Reprogramada' ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field full"><label>Nota / motivo de la reprogramación *</label><textarea class="textarea" name="nota" required placeholder="Ej: reprogramada a pedido del cliente, nueva coordinación de fecha…">${esc(v.reagenda_motivo || '')}</textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Confirmar nueva fecha</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const dlZip = node.querySelector('[data-zip]');
  if (dlZip) dlZip.onclick = async () => {
    dlZip.disabled = true; const orig = dlZip.textContent; dlZip.textContent = 'Generando…';
    try { await downloadHistorialZip(v); } catch (e) { toast('No se pudo generar el ZIP', 'info'); }
    dlZip.disabled = false; dlZip.textContent = orig;
  };
  node.querySelector('[data-save]').onclick = () => {
    const fecha = node.querySelector('[name=fecha]').value;
    const bloque = node.querySelector('[name=bloque]').value;
    const tecnico = node.querySelector('[name=tecnico]').value;
    const notaEl = node.querySelector('[name=nota]');
    const nota = (notaEl.value || '').trim();
    if (!nota) { toast('Deja una nota o motivo de la reprogramación', 'info'); notaEl.focus(); return; }
    const autor = (store.currentUser() && store.currentUser().nombre) || 'Coordinación';
    const detalle = `Nueva fecha: ${fecha} ${bloque}${tecnico ? ' · ' + tecnico : ''} — ${nota}`;
    const hist = JSON.stringify((v.historial || []).concat([{ ts: Date.now(), autor, tipo: 'reagendada', detalle, motivo: nota }]));
    store.updateVisita(v._uid, {
      fecha, bloque, tecnico,
      estado: node.querySelector('[name=estado]').value,
      reagenda_solicitada: '', reagenda_motivo: '', evidencias: '[]', historial: hist, // limpia evidencia activa; el historial se conserva
    });
    toast('Visita reagendada'); closeModal();
  };
  openModal(node, 'md', { dismissable: false });
}

// ---------------- Historial completo de la visita ----------------
const HIST_META = {
  creada: { ico: '➕', label: 'Creada' },
  asignada: { ico: '👤', label: 'Asignada' },
  reagendada: { ico: '📅', label: 'Reagendada por coordinación' },
  reagenda: { ico: '↻', label: 'Reagenda solicitada por el técnico' },
  nota: { ico: '📝', label: 'Nota del técnico' },
  cancelada: { ico: '✕', label: 'Cancelada' },
  completada: { ico: '✓', label: 'Completada' },
  validacion_pendiente: { ico: '⏳', label: 'Enviada a coordinación para autorizar' },
  autorizada: { ico: '🔓', label: 'Autorizada por coordinación' },
};
function histFecha(ts) { try { return new Date(ts).toLocaleString('es-CL'); } catch (e) { return ''; } }

/** Bloque HTML con la línea de tiempo de la visita */
export function historialBlock(v) {
  const h = Array.isArray(v.historial) ? v.historial : [];
  const nEv = h.reduce((n, e) => n + ((e.fotos || []).length) + (e.firma_cliente ? 1 : 0) + (e.firma_tecnico ? 1 : 0), 0);
  const tieneAlgo = h.length || (v.evidencias || []).length;
  return `<div class="hist-block">
    <div class="hist-head">
      <span class="ev-title">🕓 Historial de la visita · ${h.length} evento${h.length === 1 ? '' : 's'}</span>
      ${tieneAlgo ? '<button class="btn btn-sm" data-zip>⭳ Descargar todo (ZIP)</button>' : ''}
    </div>
    ${h.length ? `<div class="timeline">${h.slice().reverse().map((e) => {
      const m = HIST_META[e.tipo] || { ico: '•', label: e.tipo || 'Evento' };
      const nf = (e.fotos || []).length;
      const nota = e.detalle || e.motivo || '';
      return `<div class="tl-item">
        <span class="tl-ico">${m.ico}</span>
        <div class="tl-body">
          <div class="tl-top"><b>${esc(m.label)}</b><span class="muted-sm">${esc(histFecha(e.ts))}</span></div>
          ${e.autor ? `<div class="muted-sm">${esc(parseTecnico(e.autor).name || e.autor)}</div>` : ''}
          ${nota ? `<div class="tl-note">${esc(nota)}</div>` : ''}
          <div class="tl-tags">${nf ? `<span class="tag">📷 ${nf} foto${nf === 1 ? '' : 's'}</span>` : ''}${e.firma_cliente || e.firma_tecnico ? '<span class="tag">✍ firmas</span>' : ''}</div>
        </div>
      </div>`;
    }).join('')}</div>` : '<p class="muted-sm" style="padding:8px 0">Sin eventos registrados todavía.</p>'}
  </div>`;
}

/** Empaqueta todo el historial (fotos, firmas, documentos, OT en PDF) en un ZIP */
export async function downloadHistorialZip(v) {
  const files = [];
  const pad = (n) => String(n).padStart(2, '0');
  const h = Array.isArray(v.historial) ? v.historial : [];
  const addImg = (folder, name, uri) => {
    const b = dataUriToBytes(uri); if (!b) return;
    files.push({ name: `${folder}/${name}.${b.ext}`, data: b.bytes });
  };
  const enc = new TextEncoder();
  h.forEach((e, i) => {
    const folder = `${pad(i + 1)}_${(e.tipo || 'evento')}`;
    (e.fotos || []).forEach((u, j) => addImg(folder, `foto_${pad(j + 1)}`, u));
    if (e.firma_cliente) addImg(folder, 'firma_cliente', e.firma_cliente);
    if (e.firma_tecnico) addImg(folder, 'firma_tecnico', e.firma_tecnico);
    // Documento de evidencia completo del evento (con la nota del técnico y fotos incrustadas)
    files.push({ name: `${folder}/evidencia.html`, data: enc.encode(eventoEvidenciaHTML(v, e, i)) });
  });
  // Respaldo: visita sin historial → fotos + un documento de evidencia general
  if (!h.length) {
    (v.evidencias || []).forEach((e, j) => addImg('evidencia', `foto_${pad(j + 1)}`, e.url));
    files.push({ name: 'evidencia/evidencia.html', data: enc.encode(evidenciaHTMLDoc({
      titulo: 'Evidencia de visita', v,
      nota: v.reagenda_motivo || v.detalle || '',
      fotos: (v.evidencias || []).map((e) => e.url),
      firmaC: v.firma_cliente, firmaT: v.firma_tecnico,
    })) });
  }
  // Orden de trabajo en PDF (la misma que se envía al cliente/soporte). Requiere conexión.
  try {
    const pdf = await store.ordenPdfBytes(v._uid);
    if (pdf && pdf.length) files.push({ name: `orden_de_trabajo_${v.id}.pdf`, data: pdf });
  } catch (e) { /* sin conexión o error: se omite la OT del ZIP */ }
  // Índice general legible
  files.push({ name: 'resumen.html', data: resumenHistorialHTML(v) });
  downloadZip(`historial_${v.id}.zip`, files);
}

/** Documento de evidencia autocontenido (metadatos + nota + fotos + firmas incrustadas) */
function evidenciaHTMLDoc({ titulo, v, nota, fotos, firmaC, firmaT, evento }) {
  const t = parseTecnico(v.tecnico);
  const row = (k, val) => `<div><b>${esc(k)}:</b> ${esc(val || '—')}</div>`;
  const imgs = (fotos || []).filter(Boolean);
  const firma = (src, cap) => src ? `<figure style="margin:0 18px 8px 0;display:inline-block;text-align:center"><img style="max-width:230px;border:1px solid #ccc;border-radius:8px;background:#fff" src="${src}"><figcaption style="font-size:11px;color:#777;margin-top:4px">${esc(cap)}</figcaption></figure>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)} ${esc(v.id)}</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:26px auto;padding:0 18px;color:#111">
      <h1 style="font-size:20px;margin:0 0 4px">WIFIRED · ${esc(titulo)}</h1>
      <div style="color:#666;font-size:12px;margin-bottom:18px">Generado el ${new Date().toLocaleString('es-CL')}${evento ? ' · ' + esc(evento) : ''}</div>
      <div style="font-size:13px;line-height:1.7">
        ${row('Orden', v.id)} ${row('Cliente', v.cliente)} ${row('Técnico', t.name)}
        ${row('Estado', v.estado)} ${row('Fecha', (v.fecha || '') + ' ' + (v.bloque || ''))}
        ${v.nodo ? row('Nodo', v.nodo) : ''} ${row('Dirección', v.direccion)}
      </div>
      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:26px 0 8px;border-bottom:1px solid #e2e2e2;padding-bottom:5px">Nota del técnico</h2>
      <div style="white-space:pre-wrap;background:#f6f7f9;border:1px solid #eee;padding:12px 14px;border-radius:8px;font-size:13px">${esc(nota || 'Sin observaciones')}</div>
      ${(firmaC || firmaT) ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:26px 0 8px;border-bottom:1px solid #e2e2e2;padding-bottom:5px">Firmas</h2>${firma(firmaC, 'Firma del cliente')}${firma(firmaT, 'Firma del técnico')}` : ''}
      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:26px 0 8px;border-bottom:1px solid #e2e2e2;padding-bottom:5px">Fotografías (${imgs.length})</h2>
      ${imgs.length ? imgs.map((u, i) => `<figure style="margin:0 0 16px"><figcaption style="font-size:11px;color:#777;margin-bottom:4px">Foto ${i + 1}</figcaption><img style="max-width:100%;border:1px solid #ccc;border-radius:8px" src="${u}"></figure>`).join('') : '<p>Sin fotografías.</p>'}
    </body></html>`;
}

/** Documento de evidencia para un evento del historial */
function eventoEvidenciaHTML(v, e, i) {
  const m = HIST_META[e.tipo] || { label: e.tipo || 'Evento' };
  return evidenciaHTMLDoc({
    titulo: 'Evidencia · ' + m.label,
    v,
    nota: e.detalle || e.motivo || '',
    fotos: e.fotos || [],
    firmaC: e.firma_cliente, firmaT: e.firma_tecnico,
    evento: `${i + 1}. ${m.label} · ${histFecha(e.ts)}${e.autor ? ' · ' + parseTecnico(e.autor).name : ''}`,
  });
}

function resumenHistorialHTML(v) {
  const h = Array.isArray(v.historial) ? v.historial : [];
  const row = (k, val) => `<div><b>${esc(k)}:</b> ${esc(val || '—')}</div>`;
  const eventos = h.map((e, i) => {
    const m = HIST_META[e.tipo] || { label: e.tipo };
    return `<div style="margin:14px 0;padding:10px 12px;border:1px solid #e2e2e2;border-radius:8px">
      <div style="font-weight:700">${i + 1}. ${esc(m.label)} <span style="color:#888;font-weight:400;font-size:12px">· ${esc(histFecha(e.ts))}</span></div>
      ${e.autor ? `<div style="color:#666;font-size:12px">${esc(e.autor)}</div>` : ''}
      ${(e.detalle || e.motivo) ? `<div style="white-space:pre-wrap;margin-top:6px">${esc(e.detalle || e.motivo)}</div>` : ''}
      <div style="color:#888;font-size:12px;margin-top:6px">${(e.fotos || []).length} foto(s) · ver <b>${String(i + 1).padStart(2, '0')}_${esc(e.tipo || 'evento')}/evidencia.html</b></div>
    </div>`;
  }).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Historial ${esc(v.id)}</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:26px auto;padding:0 18px;color:#111">
      <h1 style="font-size:20px;margin:0 0 4px">WIFIRED · Historial de visita</h1>
      <div style="color:#666;font-size:12px;margin-bottom:18px">Generado el ${new Date().toLocaleString('es-CL')}</div>
      ${row('Orden', v.id)} ${row('Cliente', v.cliente)} ${row('Técnico', parseTecnico(v.tecnico).name)}
      ${row('Estado', v.estado)} ${row('Nodo', v.nodo)} ${row('Dirección', v.direccion)}
      <h2 style="font-size:14px;margin:22px 0 4px">Eventos (${h.length})</h2>
      ${eventos || '<p>Sin eventos registrados.</p>'}
    </body></html>`;
  return new TextEncoder().encode(html);
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
// dismissable:true  → tocar fuera o Escape cierra (para modales de sólo lectura).
// dismissable:false → los formularios NO se cierran por accidente: hay que usar
//                     “Cancelar” o la ✕, así nunca se pierde lo que se escribió.
export function openModal(node, size = 'md', { dismissable = true } = {}) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.dismissable = dismissable ? '1' : '0';
  const modal = document.createElement('div');
  modal.className = `modal ${size}`;
  modal.appendChild(node);
  overlay.appendChild(modal);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target !== overlay) return;
    if (dismissable) { closeModal(); return; }
    // Formulario con datos: no cerrar; dar un aviso claro y una pequeña sacudida
    modal.classList.remove('modal-nudge'); void modal.offsetWidth; modal.classList.add('modal-nudge');
    toast('Usa “Cancelar” o la ✕ para cerrar (así no pierdes lo que escribiste)', 'info');
  });
  document.addEventListener('keydown', escClose);
  root.appendChild(overlay);
  return overlay;
}
function escClose(e) {
  if (e.key !== 'Escape') return;
  const overlay = document.querySelector('#modal-root .modal-overlay');
  if (overlay && overlay.dataset.dismissable === '0') return; // formularios: sólo cierran con Cancelar/✕
  closeModal();
}
export function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  document.removeEventListener('keydown', escClose);
}

// ---------------- Detalle de visita ----------------
export function visitDetailModal(v, { onEdit, onOrder, readOnly = false } = {}) {
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
      ${v.reagenda_solicitada ? `<div class="req-banner">⏳ <strong>Solicitud de reagenda del técnico</strong><p>${esc(v.reagenda_motivo || 'Sin motivo indicado')}</p>${readOnly ? '' : '<span>Resuélvela con el botón “↻ Reagendar”.</span>'}</div>` : ''}
      ${v.validada === 'pendiente' ? `<div class="req-banner">🔓 <strong>Pendiente de autorización</strong><p>El técnico no pudo validar con el código del cliente.${readOnly ? '' : ' Revisa la evidencia y autoriza el cierre.'}</p>${readOnly ? '' : '<button class="btn btn-sm btn-primary" data-autorizar style="margin-top:8px">✓ Autorizar y completar</button>'}</div>` : ''}
      ${v.validada === 'pin' ? '<div class="ok-banner" style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12.5px">✅ Validada por el cliente con código</div>' : ''}
      ${v.validada === 'coordinacion' ? '<div class="ok-banner" style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12.5px">✅ Autorizada por coordinación</div>' : ''}
      <div class="detail-list">
        <div class="detail-row"><span class="dl-k">Prioridad</span><span class="dl-v">${priorityTag(v.prioridad)}</span></div>
        <div class="detail-row"><span class="dl-k">Tipo de visita</span><span class="dl-v">${esc(v.tipo || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Fecha</span><span class="dl-v">${fmtDate(v.fecha, true)}</span></div>
        <div class="detail-row"><span class="dl-k">Bloque horario</span><span class="dl-v">${esc(v.bloque || '—')}</span></div>
        ${v.nodo ? `<div class="detail-row"><span class="dl-k">Nodo</span><span class="dl-v">📡 ${esc(v.nodo)}</span></div>` : ''}
        <div class="detail-row"><span class="dl-k">Técnico asignado</span><span class="dl-v row" style="gap:8px">${v.tecnico ? techAvatar(v.tecnico) + esc(t.name) : '<span class="muted">Sin asignar</span>'}</span></div>
        <div class="detail-row"><span class="dl-k">RUT</span><span class="dl-v">${esc(v.rut || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Teléfono</span><span class="dl-v">${esc(v.telefono || '—')}</span></div>
        <div class="detail-row"><span class="dl-k">Dirección</span><span class="dl-v">${v.direccion ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion + ', Melipilla, Chile')}" target="_blank" rel="noopener" style="color:var(--brand-500)">${esc(v.direccion)} · ver mapa ›</a>` : '—'}</span></div>
        <div class="detail-row"><span class="dl-k">Detalle / problema</span><span class="dl-v">${esc(v.detalle || '—')}</span></div>
        ${v.asignado_por ? `<div class="detail-row"><span class="dl-k">Asignado por</span><span class="dl-v">${esc(v.asignado_por)}</span></div>` : ''}
      </div>
      ${historialBlock(v)}
    </div>
    <div class="modal-foot">
      ${readOnly ? `<span class="muted-sm">Historial de la visita</span><div class="grow"></div><button class="btn btn-primary" data-order>🧾 Orden</button>`
      : `${v.telefono ? `<a class="btn" href="${telLink(v.telefono)}">📞 Llamar</a>
      <a class="btn" style="color:#128c7e" target="_blank" rel="noopener" href="${waLink(v.telefono, `Hola ${v.cliente || ''}, le contactamos de WIFIRED por su visita técnica (${v.tipo || ''}).`)}">💬 WhatsApp</a>` : ''}
      ${store.isCoordinador() ? '<button class="btn btn-danger" data-delete title="Eliminar visita">🗑</button>' : ''}
      <div class="grow"></div>
      <button class="btn" data-order>🧾 Orden</button>
      <button class="btn ${v.reagenda_solicitada ? 'btn-primary' : ''}" data-reagendar>↻ Reagendar</button>
      <button class="btn ${v.reagenda_solicitada ? '' : 'btn-primary'}" data-edit>✎ Editar</button>`}
    </div>`;
  node.querySelector('[data-close]').onclick = closeModal;
  const editBtn = node.querySelector('[data-edit]');
  if (editBtn) editBtn.onclick = () => { closeModal(); onEdit && onEdit(v); };
  node.querySelector('[data-order]').onclick = () => { closeModal(); onOrder && onOrder(v); };
  const reagBtn = node.querySelector('[data-reagendar]');
  if (reagBtn) reagBtn.onclick = () => { closeModal(); reagendarModal(v); };
  const delBtn = node.querySelector('[data-delete]');
  if (delBtn) delBtn.onclick = async () => {
    if (!confirm(`¿Eliminar la visita ${v.id} de ${v.cliente || 'este cliente'}? Esta acción no se puede deshacer.`)) return;
    await store.deleteVisita(v._uid);
    toast('Visita eliminada', 'info');
    closeModal();
  };
  const zipBtn = node.querySelector('[data-zip]');
  if (zipBtn) zipBtn.onclick = async () => {
    zipBtn.disabled = true; const orig = zipBtn.textContent; zipBtn.textContent = 'Generando…';
    try { await downloadHistorialZip(v); } catch (e) { toast('No se pudo generar el ZIP', 'info'); }
    zipBtn.disabled = false; zipBtn.textContent = orig;
  };
  const autBtn = node.querySelector('[data-autorizar]');
  if (autBtn) autBtn.onclick = async () => {
    if (!confirm(`¿Autorizar y completar la visita ${v.id} sin código del cliente? Se enviará la orden al correo si está registrado.`)) return;
    autBtn.disabled = true; autBtn.textContent = 'Autorizando…';
    const autor = (store.currentUser() && store.currentUser().nombre) || 'Coordinación';
    const hist = JSON.stringify((v.historial || []).concat([{ ts: Date.now(), autor, tipo: 'autorizada', detalle: 'Cierre autorizado por coordinación sin código del cliente' }]));
    await store.updateVisita(v._uid, { estado: 'Completada', validada: 'coordinacion', historial: hist });
    toast('Visita autorizada y completada ✓');
    closeModal();
  };
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
        ${v.email ? `<button class="btn btn-primary btn-sm" data-send>✉️ Enviar al cliente</button>` : ''}
        <button class="btn btn-sm" data-pdf>⭳ Descargar PDF</button>
        <button class="btn btn-sm" data-print>🖨 Imprimir</button>
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
          <div class="ot-f"><div class="k">ID de cliente (RUT)</div><div class="v">${esc(v.rut || '—')}</div></div>
          <div class="ot-f"><div class="k">Teléfono del cliente</div><div class="v">${esc(v.telefono || '—')}</div></div>
          <div class="ot-f"><div class="k">Correo del cliente</div><div class="v">${esc(v.email || '—')}</div></div>
          <div class="ot-f"><div class="k">N° de trabajo</div><div class="v">${esc((String(v.id).match(/(\d+)\s*$/) || [])[1] || '—')}</div></div>
          <div class="ot-f"><div class="k">Técnico asignado</div><div class="v">${esc(t.name)}</div></div>
          <div class="ot-f"><div class="k">Fecha prevista</div><div class="v">${fmtDate(v.fecha, true)}</div></div>
          <div class="ot-f"><div class="k">Bloque horario</div><div class="v">${esc(v.bloque || '—')}</div></div>
          <div class="ot-f" style="grid-column:1/-1"><div class="k">Dirección del cliente</div><div class="v">${esc(v.direccion || '—')}</div></div>
          <div class="ot-f" style="grid-column:1/-1"><div class="k">Trabajo / descripción</div><div class="v">${esc(v.tipo || '—')}</div></div>
          <div class="ot-f" style="grid-column:1/-1"><div class="k">Comentarios adicionales</div><div class="v">${esc(v.detalle || '—')}</div></div>
          <div class="ot-f"><div class="k">Trabajos autorizados por</div><div class="v">${esc(company.autoriza)}</div></div>
          <div class="ot-f"><div class="k">Estado</div><div class="v">${esc(v.estado || '—')}</div></div>
        </div>
        <div class="ot-sign">
          <div class="sig"><div class="sig-img">${v.firma_cliente ? `<img src="${v.firma_cliente}">` : ''}</div><div class="sig-cap">Firma del cliente</div></div>
          <div class="sig"><div class="sig-img">${v.firma_tecnico ? `<img src="${v.firma_tecnico}">` : ''}</div><div class="sig-cap">Firma del técnico</div></div>
        </div>
        <p class="ot-legal">Con mi firma, declaro recibir conforme el servicio técnico contratado, validando que la instalación (cableado, perforaciones y canalizado) se realizó a mi entera satisfacción. Asimismo, constato que los equipos quedan operativos, con los parámetros de navegación (velocidad y señal Wi-Fi) verificados y aceptados en mi presencia.</p>
      </div>
    </div>`;
  node.querySelector('[data-close]').onclick = closeModal;
  node.querySelector('[data-print]').onclick = () => window.print();
  const pdfBtn = node.querySelector('[data-pdf]');
  if (pdfBtn) pdfBtn.onclick = async () => {
    pdfBtn.disabled = true; const orig = pdfBtn.textContent; pdfBtn.textContent = 'Generando…';
    try {
      const bytes = await store.ordenPdfBytes(v._uid);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `orden_${v.id}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast(e.message || 'No se pudo descargar la OT', 'info'); }
    pdfBtn.disabled = false; pdfBtn.textContent = orig;
  };
  const send = node.querySelector('[data-send]');
  if (send) send.onclick = async () => {
    send.disabled = true; send.textContent = 'Enviando…';
    try {
      const r = await store.enviarOrden(v._uid);
      if (r.ok) toast('Orden enviada a ' + v.email + ' ✉️');
      else toast('No se envió: ' + r.reason, 'info');
    } catch (e) { toast(e.message, 'info'); }
    send.disabled = false; send.textContent = '✉️ Enviar al cliente';
  };
  openModal(node, 'lg');
}
