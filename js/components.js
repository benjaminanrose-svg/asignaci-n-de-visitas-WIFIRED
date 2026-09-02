// ============================================================
// WIFIRED · Componentes de UI reutilizables + modales
// ============================================================
import { esc, parseTecnico, fmtDate, fmtDateShort, bloqueShort, colorFor, initials, telLink, waLink, todayISO, toast, limpiaRut, normalizaFono, formatRut, mapsHref, normName } from './util.js';
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
      ${imgs.length ? imgs.map((u, i) => { const vid = String(u).startsWith('data:video'); return `<figure style="margin:0 0 16px"><figcaption style="font-size:11px;color:#777;margin-bottom:4px">${vid ? 'Video' : 'Foto'} ${i + 1}</figcaption>${vid ? `<video controls style="max-width:100%;border:1px solid #ccc;border-radius:8px" src="${u}"></video>` : `<img style="max-width:100%;border:1px solid #ccc;border-radius:8px" src="${u}">`}</figure>`; }).join('') : '<p>Sin fotografías.</p>'}
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

/** Estado de la confirmación por WhatsApp del cliente + botón para pedirla ahora */
function confirmacionBlock(v, readOnly) {
  const activa = ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado);
  let estado = '';
  if (v.confirmacion === 'si') estado = '<span style="color:#10b981;font-weight:600">✅ Confirmada por el cliente</span>';
  else if (v.confirmacion === 'no') estado = '<span style="color:#ef4444;font-weight:600">❌ Cancelada por el cliente</span>';
  else if (v.confirmacion_enviada) estado = '<span style="color:#f59e0b;font-weight:600">⏳ Esperando respuesta del cliente</span>';
  const puedePedir = !readOnly && store.isCoordinador() && v.telefono && activa && v.confirmacion !== 'si';
  if (!estado && !puedePedir) return '';
  return `<div class="detail-list" style="margin-top:10px">
      <div class="detail-row"><span class="dl-k">Confirmación</span><span class="dl-v">${estado || '<span class="muted">Sin pedir aún</span>'}</span></div>
    </div>
    ${puedePedir ? '<div style="margin-top:8px"><button class="btn btn-sm" data-pedirconf>📅 Pedir confirmación ahora por WhatsApp</button></div>' : ''}`;
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

// ---------------- Ficha / historial del cliente ----------------
function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/**
 * Devuelve todas las visitas del mismo cliente que la visita `v`.
 * Usa el identificador más fuerte disponible, en orden: RUT → teléfono → nombre.
 * Así se agrupa de forma predecible sin mezclar clientes distintos.
 */
export function clientVisits(v) {
  const all = store.visitas();
  const rut = limpiaRut(v.rut);
  if (rut && rut.length >= 2) return all.filter((x) => limpiaRut(x.rut) === rut);
  const fono = normalizaFono(v.telefono);
  if (fono) return all.filter((x) => normalizaFono(x.telefono) === fono);
  const name = normName(v.cliente);
  if (name) return all.filter((x) => normName(x.cliente) === name);
  return [v];
}

/** Modal con la ficha del cliente: sus datos y todas sus visitas registradas */
export function clientCardModal(v, opts = {}) {
  const visitas = clientVisits(v).slice()
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || String(b.id).localeCompare(String(a.id)));
  const n = visitas.length;
  const by = (f) => visitas.filter(f).length;
  const activas = by((x) => ['Pendiente', 'Programada', 'Reprogramada'].includes(x.estado));
  const comp = by((x) => x.estado === 'Completada');
  const canc = by((x) => x.estado === 'Cancelada');

  // Datos de identidad: se toma el más reciente que tenga cada campo
  const first = (getter) => { for (const x of visitas) { const val = getter(x); if (val) return val; } return ''; };
  const svc0 = opts.servicio || {};
  const rut = first((x) => x.rut) || svc0.rut || '';
  const fono = first((x) => x.telefono) || svc0.telefono || '';
  const email = first((x) => x.email) || svc0.email || '';
  const dir = first((x) => x.direccion) || svc0.direccion || '';
  const ident = [rut ? '🪪 ' + esc(formatRut(rut)) : '', fono ? '📞 ' + esc(fono) : '', email ? '✉️ ' + esc(email) : '']
    .filter(Boolean).join('  ·  ');

  const pill = (cls, num, label) => `<div class="ds-pill ${cls}"><span class="ds-dot"></span><span class="ds-n">${num}</span><span class="ds-l">${esc(label)}</span></div>`;

  // Bloque de servicio de internet (si el cliente tiene uno vinculado)
  const svc = opts.servicio;
  const svcBlock = svc ? `
    <div class="hist-head" style="margin:14px 0 6px"><span class="ev-title">📡 Servicio de internet</span></div>
    <div class="detail-list" style="margin-bottom:6px">
      <div class="detail-row"><span class="dl-k">Plan</span><span class="dl-v">${esc(svc.plan || '—')}</span></div>
      <div class="detail-row"><span class="dl-k">Nodo</span><span class="dl-v">${svc.nodo ? '📡 ' + esc(svc.nodo) : '—'}</span></div>
      <div class="detail-row"><span class="dl-k">IP</span><span class="dl-v">${esc(svc.ip || '—')}</span></div>
      <div class="detail-row"><span class="dl-k">Usuario PPPoE</span><span class="dl-v">${esc(svc.pppoe_user || '—')}</span></div>
      <div class="detail-row"><span class="dl-k">Día de pago</span><span class="dl-v">${esc(svc.dia_pago || '—')}</span></div>
      <div class="detail-row"><span class="dl-k">Estado</span><span class="dl-v">${svc.estado === 'cortado' ? '⛔ Cortado' : '● Activo'}</span></div>
    </div>
    ${opts.onEditServicio ? '<button class="btn btn-sm btn-primary" data-editsvc style="margin-bottom:6px">✎ Editar servicio</button>' : ''}` : '';

  const row = (x) => {
    const tt = parseTecnico(x.tecnico);
    const esActual = x._uid === v._uid;
    return `<button class="day-row" data-open="${esc(x._uid)}" style="width:100%;text-align:left${esActual ? ';background:var(--surface-2)' : ''}">
      <span style="flex:1; min-width:0">
        <span class="cell-strong truncate" style="display:block">${esc(x.tipo || 'Visita')} <span class="muted-sm" style="font-weight:400">· ${esc(x.id)}</span>${esActual ? ' <span class="tag">esta visita</span>' : ''}</span>
        <span class="cell-sub truncate" style="display:block">${esc(fmtDateShort(x.fecha))}${x.tecnico ? ' · ' + esc(tt.short) : ' · sin asignar'}${x.direccion ? ' · ' + esc(x.direccion) : ''}</span>
      </span>
      <span style="flex-shrink:0">${statusBadge(x.estado)}</span>
    </button>`;
  };

  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="row" style="gap:10px">${clientAvatar(v.cliente)}<h3 class="truncate">${esc(v.cliente || 'Sin nombre')}</h3></div>
        ${ident ? `<div class="muted-sm" style="margin-top:6px">${ident}</div>` : ''}
      </div>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="day-summary" style="margin-bottom:14px">
        ${pill('ds-total', n, n === 1 ? 'visita' : 'visitas')}
        ${pill('ds-comp', comp, 'completadas')}
        ${pill('ds-prog', activas, 'activas')}
        ${pill('ds-repr', canc, 'canceladas')}
      </div>
      ${dir ? `<div class="muted-sm" style="margin-bottom:12px">📍 <a href="${mapsHref(dir)}" target="_blank" rel="noopener" style="color:var(--brand-500)">${esc(dir)} · ver mapa ›</a></div>` : ''}
      ${svcBlock}
      <div data-equipos-cli></div>
      <div class="hist-head" style="margin-bottom:6px"><span class="ev-title">🗂 Todas sus visitas (${n})</span></div>
      <div class="kpi-vlist">${n ? visitas.map(row).join('') : '<div class="muted-sm" style="padding:8px 2px">Sin visitas registradas aún.</div>'}</div>
    </div>
    <div class="modal-foot"><span class="muted-sm">${n ? 'Toca una visita para ver su detalle' : ''}</span><div class="grow"></div><button class="btn" data-close>Cerrar</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const editSvcBtn = node.querySelector('[data-editsvc]');
  if (editSvcBtn) editSvcBtn.onclick = () => { closeModal(); opts.onEditServicio(svc); };
  node.querySelectorAll('[data-open]').forEach((el) => (el.onclick = () => {
    const x = store.byUid(el.dataset.open);
    if (!x) return;
    closeModal();
    visitDetailModal(x, opts);
  }));
  if (store.isCoordinador && store.isCoordinador()) cargarEquiposCliente(node, v.cliente);
  openModal(node, 'md');
}

// Sección "📦 Equipos instalados" de la ficha: vincula por nombre de cliente
// (mismo campo `cliente` que guarda Bodega). Permite devolver a bodega o dar de baja.
const CAT_TINT = { Decos: '#3a6098', Routers: '#3f9d6d', Antenas: '#c79232', 'Mesh (Repetidores)': '#8a63d2' };
function equipoFechaInstal(it) {
  const h = Array.isArray(it.historial) ? it.historial : [];
  for (let k = h.length - 1; k >= 0; k--) if (h[k].estado === 'instalado') return h[k].ts;
  return it.updated_at || '';
}
async function cargarEquiposCliente(node, nombreCliente) {
  const host = node.querySelector('[data-equipos-cli]');
  if (!host || typeof store.listInventario !== 'function' || !normName(nombreCliente)) return;
  let equipos = [];
  try {
    const r = await store.listInventario();
    equipos = (r.inventario || []).filter((it) => it.estado === 'instalado' && normName(it.cliente) === normName(nombreCliente));
  } catch (e) { return; }
  const badge = (cat) => { const t = CAT_TINT[cat] || '#55607a'; return `<span class="tag" style="background:color-mix(in srgb, ${t} 16%, transparent);border-color:color-mix(in srgb, ${t} 40%, var(--border));color:${t}">${esc(cat || 'Equipo')}</span>`; };
  host.innerHTML = `
    <div class="hist-head" style="margin:14px 0 6px"><span class="ev-title">📦 Equipos instalados (${equipos.length})</span></div>
    ${equipos.length ? `<div class="cli-eq-list">${equipos.map((it) => `
      <div class="cli-eq-row">
        <span class="cli-eq-main">${badge(it.categoria)}<span class="cli-eq-cod">${esc(it.codigo)}</span><span class="muted-sm">🗓 ${esc(fmtDateShort(equipoFechaInstal(it)) || '—')}</span></span>
        <span class="cli-eq-acc"><button class="btn btn-sm" data-eq-dev="${esc(it._uid)}" title="Devolver a bodega">↩ A bodega</button><button class="btn btn-sm btn-danger" data-eq-baja="${esc(it._uid)}" title="Dar de baja">⛔</button></span>
      </div>`).join('')}</div>` : '<div class="muted-sm" style="padding:6px 2px">Sin equipos instalados vinculados.</div>'}`;
  const retirar = async (uid, accion) => {
    try { await store.moverInventario(uid, { accion, nota: 'Retirado desde ficha de cliente' }); toast(accion === 'baja' ? 'Equipo dado de baja' : 'Equipo devuelto a bodega'); cargarEquiposCliente(node, nombreCliente); }
    catch (e) { toast(e.message || 'No se pudo retirar', 'info'); }
  };
  host.querySelectorAll('[data-eq-dev]').forEach((b) => (b.onclick = () => retirar(b.dataset.eqDev, 'devolver')));
  host.querySelectorAll('[data-eq-baja]').forEach((b) => (b.onclick = () => { if (confirm('¿Dar de baja este equipo? Sale del inventario activo.')) retirar(b.dataset.eqBaja, 'baja'); }));
}

// ---------------- Detalle de visita ----------------
export function visitDetailModal(v, { onEdit, onOrder, readOnly = false } = {}) {
  const t = parseTecnico(v.tecnico);
  const otrasCliente = clientVisits(v).length;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="row" style="gap:10px">
          <span class="cell-id" style="font-size:14px">${esc(v.id)}</span>
          ${statusBadge(v.estado)}
        </div>
        <h3 style="margin-top:6px">${esc(v.cliente || 'Sin nombre')}</h3>
        ${otrasCliente >= 2 ? `<button class="btn btn-sm" data-clientcard style="margin-top:8px">📋 Ficha del cliente · ${otrasCliente} visitas</button>` : ''}
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
        <div class="detail-row"><span class="dl-k">Dirección</span><span class="dl-v">${v.direccion ? `<a href="${mapsHref(v.direccion)}" target="_blank" rel="noopener" style="color:var(--brand-500)">${esc(v.direccion)} · ver mapa ›</a>` : '—'}</span></div>
        <div class="detail-row"><span class="dl-k">Detalle / problema</span><span class="dl-v">${esc(v.detalle || '—')}</span></div>
        ${v.asignado_por ? `<div class="detail-row"><span class="dl-k">Asignado por</span><span class="dl-v">${esc(v.asignado_por)}</span></div>` : ''}
      </div>
      ${confirmacionBlock(v, readOnly)}
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
  const ccBtn = node.querySelector('[data-clientcard]');
  if (ccBtn) ccBtn.onclick = () => { closeModal(); clientCardModal(v, { onEdit, onOrder, readOnly }); };
  const editBtn = node.querySelector('[data-edit]');
  if (editBtn) editBtn.onclick = () => { closeModal(); onEdit && onEdit(v); };
  node.querySelector('[data-order]').onclick = () => { closeModal(); onOrder && onOrder(v); };
  const reagBtn = node.querySelector('[data-reagendar]');
  if (reagBtn) reagBtn.onclick = () => { closeModal(); reagendarModal(v); };
  const pcBtn = node.querySelector('[data-pedirconf]');
  if (pcBtn) pcBtn.onclick = async () => {
    if (!confirm('¿Enviar ahora la solicitud de confirmación al cliente por WhatsApp?')) return;
    pcBtn.disabled = true; const orig = pcBtn.textContent; pcBtn.textContent = 'Enviando…';
    try { await store.pedirConfirmacionVisita(v._uid); toast('📤 Solicitud de confirmación en cola'); closeModal(); }
    catch (e) { toast(e.message || 'No se pudo enviar', 'info'); pcBtn.disabled = false; pcBtn.textContent = orig; }
  };
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
