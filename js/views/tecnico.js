// ============================================================
// WIFIRED · Portal del Técnico — sus visitas asignadas
// ============================================================
import * as store from '../store.js';
import { esc, fmtDate, fmtDateShort, todayISO, bloqueShort, toast, prioRank, telLink, waLink, bindField, validaEmail, mapsHref, zonaDeVisita } from '../util.js';
import { statusBadge, priorityTag, openModal, closeModal } from '../components.js';
import { createPhotoPicker, openPhoto } from '../photos.js';
import { createSignaturePad } from '../signature.js';
import { pushSupported, notifPermission, enablePush } from '../push.js';

/** Une evidencias existentes con las nuevas fotos y devuelve JSON */
function evJSON(v, photos, tipo) {
  const prev = Array.isArray(v.evidencias) ? v.evidencias : [];
  const add = photos.map((url) => ({ url, ts: Date.now(), tipo }));
  return JSON.stringify(prev.concat(add));
}

/** Agrega un evento al historial de la visita (acumulativo) y devuelve JSON */
function histJSON(v, entry) {
  const prev = Array.isArray(v.historial) ? v.historial : [];
  const autor = (store.currentUser() && store.currentUser().nombre) || v.tecnico || '';
  return JSON.stringify(prev.concat([{ ts: Date.now(), autor, ...entry }]));
}

const local = { filtro: 'hoy' };

// --- Reporte de ubicación GPS (cada 1 min mientras el técnico tenga la app abierta) ---
let geoStarted = false;
function startGeoReport() {
  if (geoStarted || !('geolocation' in navigator)) return;
  geoStarted = true;
  const enviar = () => navigator.geolocation.getCurrentPosition(
    (p) => { store.reportarUbicacion(p.coords.latitude, p.coords.longitude).catch(() => {}); },
    () => {}, // si no hay permiso, no molesta: simplemente no reporta
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
  );
  enviar();
  setInterval(enviar, 60 * 1000);
}

export function renderTecnico(root) {
  startGeoReport();
  const user = store.currentUser() || {};
  const all = store.visitas();
  const today = todayISO();
  const activas = (v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado);

  const filtros = {
    hoy: (v) => v.fecha === today && activas(v),
    // Solo de hoy en adelante (o sin fecha): las de días pasados no se muestran.
    porhacer: (v) => activas(v) && (!v.fecha || v.fecha >= today),
    completadas: (v) => v.estado === 'Completada',
  };
  // Primera carga: abrir en la primera pestaña con contenido (evita pantalla vacía)
  if (!local.inited) {
    local.inited = true;
    local.filtro = ['hoy', 'porhacer', 'completadas'].find((k) => all.filter(filtros[k]).length) || 'hoy';
  }
  if (!filtros[local.filtro]) local.filtro = 'porhacer';
  let list = all.filter(filtros[local.filtro] || (() => true))
    // Por fecha, luego el orden manual que fijó coordinación, luego prioridad y bloque.
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (Number(a.orden) || 0) - (Number(b.orden) || 0) || prioRank(a.prioridad) - prioRank(b.prioridad) || (a.bloque || '').localeCompare(b.bloque || ''));

  const count = (k) => all.filter(filtros[k]).length;

  const online = store.isOnline();
  const pend = store.pendingCount();
  let syncBar = '';
  if (!online) syncBar = `<div class="sync-bar off">📴 Sin conexión — ${pend} cambio(s) se enviarán al reconectar</div>`;
  else if (pend > 0) syncBar = `<div class="sync-bar syncing">⟳ Sincronizando ${pend} cambio(s)…</div>`;
  const fall = store.fallidosCount ? store.fallidosCount() : 0;
  if (fall > 0) syncBar += `<div class="sync-bar fail"><span>⚠️ ${fall} cambio(s) guardados en tu celular no se pudieron confirmar. No se perdieron.</span><button class="btn btn-sm" data-reintentar>Reintentar</button></div>`;

  const showNotif = online && pushSupported() && notifPermission() !== 'granted';
  const notifBar = showNotif
    ? `<div class="notif-prompt"><span>🔔 Activa las notificaciones para enterarte cuando te asignen una visita.</span><button class="btn btn-sm btn-primary" data-enable-notif>Activar</button></div>`
    : '';

  root.innerHTML = `
    ${syncBar}
    ${notifBar}
    <div class="tec-hero">
      <div>
        <div class="tec-hello">Hola, ${esc((user.nombre || '').replace(/^(Técnico|Ingeniero|Soporte de Emergencia|Soporte|Planta Externa)\s*/, '') || user.nombre)} 👋</div>
        <div class="muted-sm">${all.filter(filtros.hoy).length} visita(s) para hoy · ${fmtDate(today, true)}</div>
      </div>
    </div>

    <div class="tec-tabs">
      ${tab('hoy', 'Hoy', count('hoy'))}
      ${tab('porhacer', 'Por hacer', count('porhacer'))}
      ${tab('completadas', 'Completadas', count('completadas'))}    </div>

    <div class="tec-list">
      ${list.length ? list.map(card).join('') : `<div class="empty-state"><div class="es-ico">✓</div><p>No tienes visitas en esta sección.</p></div>`}
    </div>`;

  const notifBtn = root.querySelector('[data-enable-notif]');
  if (notifBtn) notifBtn.onclick = async () => {
    notifBtn.disabled = true; notifBtn.textContent = '…';
    try { await enablePush(); toast('Notificaciones activadas 🔔'); renderTecnico(root); }
    catch (e) { toast(e.message, 'info'); notifBtn.disabled = false; notifBtn.textContent = 'Activar'; }
  };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { local.filtro = b.dataset.tab; renderTecnico(root); }));
  const reBtn = root.querySelector('[data-reintentar]');
  if (reBtn) reBtn.onclick = () => { store.reintentarFallidos(); renderTecnico(root); };
  root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    const uid = b.dataset.uid, act = b.dataset.act;
    // Trae las fotos reales antes de cualquier acción: la carga inicial viene
    // liviana y hay que evitar reescribir el historial sin sus fotos.
    const vv = store.byUid(uid);
    if (vv && vv._media === false) {
      b.disabled = true;
      try { await store.conMedia(vv); } catch (err) { toast('Sin conexión: intenta de nuevo', 'info'); b.disabled = false; return; }
      b.disabled = false;
    }
    if (act === 'completar') completarModal(uid);
    else if (act === 'cancelar') cancelarModal(uid);
    else if (act === 'solicitar') solicitarModal(uid);
    else if (act === 'nota') notaModal(uid);
    else if (act === 'ver-fotos') { const v = store.byUid(uid); if (v && v.evidencias[0]) openPhoto(v.evidencias[0].url); }
  }));
}

function tab(k, label, n) {
  return `<button class="tec-tab ${local.filtro === k ? 'active' : ''}" data-tab="${k}">${esc(label)}<span class="tec-tab-n">${n}</span></button>`;
}

function card(v) {
  const done = v.estado === 'Completada';
  const cancel = v.estado === 'Cancelada';
  const cerrada = done || cancel;
  const pedida = !!v.reagenda_solicitada;
  const esFacti = String(v.tipo || '').trim().toLowerCase() === 'factibilidad';
  const nFotos = (v.evidencias || []).length;
  const z = zonaDeVisita(v);
  const uid = esc(v._uid);
  return `
  <div class="tec-card ${cerrada ? 'done' : ''}">
    <div class="tec-card-top">
      <span class="tec-ot">${esc(v.id || '')}</span>
      ${statusBadge(v.estado)}
    </div>
    <div class="tec-chips">
      ${priorityTag(v.prioridad)}
      <span class="tag tag-block">${esc(bloqueShort(v.bloque))}</span>
      <span class="tec-fecha">📅 ${esc(fmtDateShort(v.fecha))}</span>
      ${z ? `<span class="zona-badge" style="color:${z.color};border-color:color-mix(in srgb, ${z.color} 45%, var(--border));background:color-mix(in srgb, ${z.color} 15%, transparent)">📍 ${z.label}</span>` : ''}
    </div>
    <div class="tec-client">${esc(v.cliente || 'Sin nombre')}</div>
    <div class="tec-type">${esc(v.tipo || '—')}</div>
    ${v.direccion ? `<div class="tec-meta">📍 ${/^ *-?[0-9]+([.][0-9]+)? *, *-?[0-9]+([.][0-9]+)? *$/.test(v.direccion) ? 'Ubicación GPS' : esc(v.direccion)}</div>` : ''}
    ${v.gps ? `<div class="tec-meta tec-gps-ok">✓ Ubicación GPS guardada</div>` : ''}
    ${(v.gps || v.direccion || v.telefono) ? `<div class="tec-quick">
      ${(v.gps || v.direccion) ? `<a class="tec-qbtn" href="${mapsHref(v.gps || v.direccion)}" target="_blank" rel="noopener">🧭 Mapa</a>` : ''}
      ${v.telefono ? `<a class="tec-qbtn" href="${telLink(v.telefono)}">📞 Llamar</a>` : ''}
      ${v.telefono ? `<a class="tec-qbtn wa" href="${waLink(v.telefono, `Hola ${v.cliente || ''}, le contactamos de WIFIRED por su visita técnica.`)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
    </div>` : ''}
    ${v.detalle ? `<div class="tec-note">📝 ${esc(v.detalle)}</div>` : ''}
    ${pedida ? `<div class="tec-req">⏳ Reagenda solicitada — a la espera de nueva fecha por coordinación</div>` : ''}
    ${nFotos ? `<button class="tec-fotos" data-act="ver-fotos" data-uid="${uid}">📷 ${nFotos} foto${nFotos === 1 ? '' : 's'} de evidencia</button>` : ''}
    <div class="tec-actions">
      ${cerrada || pedida ? '' : `<button class="btn btn-primary tec-main" data-act="completar" data-uid="${uid}">✓ Completar visita</button>`}
      <div class="tec-actions-sec">
        ${cerrada || pedida || esFacti ? '' : `<button class="btn" data-act="solicitar" data-uid="${uid}">↻ Reagenda</button>`}
        ${esFacti ? '' : `<button class="btn" data-act="nota" data-uid="${uid}">📝 Nota</button>`}
        ${cerrada || pedida || esFacti ? '' : `<button class="btn btn-danger" data-act="cancelar" data-uid="${uid}">✕ Cancelar</button>`}
      </div>
    </div>
  </div>`;
}

// Inserta el selector de fotos dentro de un contenedor del modal
function attachPicker(node) {
  const picker = createPhotoPicker();
  node.querySelector('[data-photos]').appendChild(picker.element);
  return picker;
}

// ---------- Completar FACTIBILIDAD (firma + nota + resultado sí/no) ----------
function completarFactibilidadModal(uid, v) {
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Completar factibilidad</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.id)} · ${esc(v.cliente)} · 📶 Factibilidad</p>
      <div class="field"><label>Nota / observación</label>
        <textarea class="textarea" name="detalle" style="min-height:110px" placeholder="Observaciones de la revisión de factibilidad…">${esc(v.detalle || '')}</textarea></div>
      <div class="field" style="margin-top:14px"><label>Firma *</label><div data-sig></div></div>
      <p class="muted-sm" style="margin-top:16px;font-weight:600;color:var(--text)">¿El sector tiene factibilidad?</p>
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancelar</button>
      <div class="grow"></div>
      <button class="btn btn-danger" data-no>✕ No hay factibilidad</button>
      <button class="btn btn-primary" data-si>✅ Hay factibilidad</button>
    </div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const sig = createSignaturePad('Firma');
  node.querySelector('[data-sig]').appendChild(sig.element);

  const guardar = (resultado) => {
    if (sig.isEmpty()) { toast('Falta la firma', 'info'); return; }
    const nota = node.querySelector('[name=detalle]').value.trim();
    const firma = sig.getData();
    const etiqueta = resultado === 'si' ? 'HAY FACTIBILIDAD' : 'NO HAY FACTIBILIDAD';
    const detFinal = nota ? `${etiqueta} — ${nota}` : etiqueta;
    store.updateVisita(uid, {
      estado: 'Completada',
      detalle: detFinal,
      firma_cliente: firma,
      historial: histJSON(v, { tipo: 'factibilidad', resultado, estado: 'Completada', detalle: detFinal, firma_cliente: firma }),
    });
    toast(resultado === 'si' ? 'Factibilidad registrada ✓' : 'Sin factibilidad registrado ✓');
    closeModal();
  };
  node.querySelector('[data-si]').onclick = () => guardar('si');
  node.querySelector('[data-no]').onclick = () => guardar('no');
  openModal(node, 'md', { dismissable: false });
}

// ---------- Completar (observación + evidencia + firmas + código de validación) ----------
function completarModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  if (String(v.tipo || '').trim().toLowerCase() === 'factibilidad') return completarFactibilidadModal(uid, v);
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Completar visita</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.id)} · ${esc(v.cliente)} · ${esc(v.tipo)}</p>
      <div class="field"><label>Correo del cliente <span class="muted-sm">(opcional: recibe la orden de trabajo)</span></label>
        <input class="input" type="email" name="email" value="${esc(v.email || '')}" placeholder="cliente@correo.com"></div>
      <div class="field" style="margin-top:12px"><label>Observación del trabajo *</label>
        <textarea class="textarea" name="detalle" required placeholder="Trabajo realizado, equipos, mediciones…">${esc(v.detalle || '')}</textarea></div>
      <div class="field" style="margin-top:12px"><label>Evidencia * <span class="muted-sm">(al menos una foto o video ≤30s)</span></label><div data-photos></div></div>
      <div class="field" style="margin-top:14px"><label>Firma del cliente *</label><div data-sig-cliente></div></div>
      <div class="field" style="margin-top:6px"><label>Firma del técnico</label><div data-sig-tecnico></div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><div class="grow"></div><button class="btn btn-primary" data-completar>✓ Completar visita</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  const sigC = createSignaturePad('Firma del cliente');
  const sigT = createSignaturePad('Firma del técnico');
  node.querySelector('[data-sig-cliente]').appendChild(sigC.element);
  node.querySelector('[data-sig-tecnico]').appendChild(sigT.element);

  const emailEl = node.querySelector('[name=email]');
  bindField(emailEl, { validate: (x) => !x || validaEmail(x), msg: 'Correo inválido' });

  // Nota y al menos una foto son obligatorias para cerrar la visita
  const faltaNotaFoto = () => {
    const detEl = node.querySelector('[name=detalle]');
    if (!detEl.value.trim()) { toast('Escribe la observación del trabajo', 'info'); detEl.focus(); return true; }
    if (!picker.getPhotos().length) { toast('Agrega al menos una foto o video de evidencia', 'info'); return true; }
    return false;
  };

  // Reúne el parche común (evidencia, firmas, nota, historial)
  const buildPatch = (extra, tipo) => {
    const fotos = picker.getPhotos();
    const detalle = node.querySelector('[name=detalle]').value;
    const firma_cliente = sigC.getData(), firma_tecnico = sigT.getData();
    return {
      email: (emailEl.value || '').trim(),
      detalle,
      evidencias: evJSON(v, fotos, tipo),
      firma_cliente, firma_tecnico,
      historial: histJSON(v, { tipo, estado: extra.estado || v.estado, detalle, fotos, firma_cliente, firma_tecnico, motivo: extra.motivo }),
      ...extra,
    };
  };

  // Cierre directo (sin código ni autorización): observación + foto + firma del cliente.
  node.querySelector('[data-completar]').onclick = () => {
    if (faltaNotaFoto()) return;
    if (sigC.isEmpty()) { toast('Falta la firma del cliente', 'info'); return; }
    const email = (emailEl.value || '').trim();
    if (email && !validaEmail(email)) { toast('El correo del cliente no es válido', 'info'); emailEl.focus(); return; }
    store.updateVisita(uid, buildPatch({ estado: 'Completada' }, 'completada'));
    toast('Visita completada ✓'); closeModal();
  };

  openModal(node, 'lg', { dismissable: false });
}

// ---------- Cancelar (con motivo + evidencia) ----------
function cancelarModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Cancelar visita</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.cliente)} · ${esc(v.tipo)}</p>
      <div class="field"><label>Motivo de la cancelación *</label>
        <textarea class="textarea" name="motivo" placeholder="Ej: cliente desistió, dirección inexistente…" required>${esc(v.detalle || '')}</textarea></div>
      <div class="field" style="margin-top:12px"><label>Evidencia * <span class="muted-sm">(al menos una foto o video ≤30s)</span></label><div data-photos></div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Volver</button><button class="btn btn-danger" data-save>✕ Cancelar visita</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { toast('Escribe el motivo de la cancelación', 'info'); node.querySelector('[name=motivo]').focus(); return; }
    const fotos = picker.getPhotos();
    if (!fotos.length) { toast('Agrega al menos una foto o video de evidencia', 'info'); return; }
    store.updateVisita(uid, { estado: 'Cancelada', detalle: motivo, evidencias: evJSON(v, fotos, 'cancelada'), historial: histJSON(v, { tipo: 'cancelada', estado: 'Cancelada', motivo, fotos }) });
    toast('Visita cancelada', 'info'); closeModal();
  };
  openModal(node, 'md', { dismissable: false });
}

// ---------- Solicitar reagenda (con motivo + evidencia) ----------
function solicitarModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Solicitar reagenda</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.cliente)} · ${esc(v.tipo)}</p>
      <div class="field"><label>Motivo de la solicitud *</label>
        <textarea class="textarea" name="motivo" placeholder="Ej: cliente no se encontraba, falta de poste, coordinar otro día…" required></textarea></div>
      <div class="field" style="margin-top:12px"><label>Evidencia * <span class="muted-sm">(al menos una foto o video ≤30s)</span></label><div data-photos></div></div>
      <p class="muted-sm" style="margin-top:10px">Coordinación revisará tu solicitud y asignará una nueva fecha.</p>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Enviar solicitud</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { toast('Escribe el motivo de la solicitud', 'info'); node.querySelector('[name=motivo]').focus(); return; }
    const fotos = picker.getPhotos();
    if (!fotos.length) { toast('Agrega al menos una foto o video de evidencia', 'info'); return; }
    store.updateVisita(uid, { reagenda_solicitada: 'true', reagenda_motivo: motivo, estado: 'Pendiente', evidencias: evJSON(v, fotos, 'reagenda'), historial: histJSON(v, { tipo: 'reagenda', motivo, fotos }) });
    toast('Solicitud de reagenda enviada'); closeModal();
  };
  openModal(node, 'md', { dismissable: false });
}

// ---------- Nota ----------
function notaModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Nota / observación</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Detalle de la visita</label><textarea class="textarea" name="detalle" style="min-height:120px" placeholder="Escribe una observación…">${esc(v.detalle || '')}</textarea></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  node.querySelector('[data-save]').onclick = () => {
    const detalle = node.querySelector('[name=detalle]').value;
    store.updateVisita(uid, { detalle, historial: histJSON(v, { tipo: 'nota', detalle }) });
    toast('Nota guardada'); closeModal();
  };
  openModal(node, 'md', { dismissable: false });
}
