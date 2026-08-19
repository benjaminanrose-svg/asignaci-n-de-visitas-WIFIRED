// ============================================================
// WIFIRED · Portal del Técnico — sus visitas asignadas
// ============================================================
import * as store from '../store.js';
import { esc, fmtDate, fmtDateShort, todayISO, bloqueShort, toast, prioRank, telLink, waLink, bindField, validaEmail } from '../util.js';
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

export function renderTecnico(root) {
  const user = store.currentUser() || {};
  const all = store.visitas();
  const today = todayISO();
  const activas = (v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado);

  const filtros = {
    hoy: (v) => v.fecha === today && activas(v),
    porhacer: (v) => activas(v),
    completadas: (v) => v.estado === 'Completada',
    todas: () => true,
  };
  // Primera carga: abrir en la primera pestaña con contenido (evita pantalla vacía)
  if (!local.inited) {
    local.inited = true;
    local.filtro = ['hoy', 'porhacer', 'completadas', 'todas'].find((k) => all.filter(filtros[k]).length) || 'todas';
  }
  if (!filtros[local.filtro]) local.filtro = 'porhacer';
  let list = all.filter(filtros[local.filtro] || (() => true))
    .sort((a, b) => prioRank(a.prioridad) - prioRank(b.prioridad) || (a.fecha || '').localeCompare(b.fecha || '') || (a.bloque || '').localeCompare(b.bloque || ''));

  const count = (k) => all.filter(filtros[k]).length;

  const online = store.isOnline();
  const pend = store.pendingCount();
  let syncBar = '';
  if (!online) syncBar = `<div class="sync-bar off">📴 Sin conexión — ${pend} cambio(s) se enviarán al reconectar</div>`;
  else if (pend > 0) syncBar = `<div class="sync-bar syncing">⟳ Sincronizando ${pend} cambio(s)…</div>`;

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
      ${tab('completadas', 'Completadas', count('completadas'))}
      ${tab('todas', 'Todas', all.length)}
    </div>

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
  root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const uid = b.dataset.uid, act = b.dataset.act;
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
  const nFotos = (v.evidencias || []).length;
  const tel = (v.telefono || '').split('/')[0].replace(/\s/g, '');
  return `
  <div class="tec-card ${cerrada ? 'done' : ''}">
    <div class="tec-card-top">
      <div class="row" style="gap:8px; flex-wrap:wrap">
        ${priorityTag(v.prioridad)}
        <span class="tag tag-block">${esc(bloqueShort(v.bloque))}</span>
        <span class="tec-fecha">${esc(fmtDateShort(v.fecha))}</span>
      </div>
      ${statusBadge(v.estado)}
    </div>
    <div class="tec-client">${esc(v.cliente || 'Sin nombre')}</div>
    <div class="tec-type">${esc(v.tipo || '—')}</div>
    ${v.direccion ? `<a class="tec-meta tec-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion + ', Melipilla, Chile')}" target="_blank" rel="noopener">📍 ${esc(v.direccion)} <span class="tec-map-go">· Cómo llegar ›</span></a>` : ''}
    ${v.telefono ? `<div class="tec-meta">📞 <a href="${telLink(v.telefono)}">${esc(v.telefono)}</a> · <a href="${waLink(v.telefono, `Hola ${v.cliente || ''}, le contactamos de WIFIRED por su visita técnica.`)}" target="_blank" rel="noopener" style="color:#128c7e">WhatsApp</a></div>` : ''}
    ${v.detalle ? `<div class="tec-note">📝 ${esc(v.detalle)}</div>` : ''}
    ${pedida ? `<div class="tec-req">⏳ Reagenda solicitada — a la espera de nueva fecha por coordinación</div>` : ''}
    ${nFotos ? `<button class="tec-fotos" data-act="ver-fotos" data-uid="${esc(v._uid)}">📷 ${nFotos} foto${nFotos === 1 ? '' : 's'} de evidencia</button>` : ''}
    <div class="tec-actions">
      ${cerrada || pedida ? '' : `<button class="btn btn-primary btn-sm" data-act="completar" data-uid="${esc(v._uid)}">✓ Completar</button>`}
      ${cerrada || pedida ? '' : `<button class="btn btn-sm" data-act="solicitar" data-uid="${esc(v._uid)}">↻ Reagenda</button>`}
      ${cerrada || pedida ? '' : `<button class="btn btn-sm btn-danger" data-act="cancelar" data-uid="${esc(v._uid)}">✕ Cancelar</button>`}
      <button class="btn btn-sm" data-act="nota" data-uid="${esc(v._uid)}">📝 Nota</button>
    </div>
  </div>`;
}

// Inserta el selector de fotos dentro de un contenedor del modal
function attachPicker(node) {
  const picker = createPhotoPicker();
  node.querySelector('[data-photos]').appendChild(picker.element);
  return picker;
}

// ---------- Completar (observación + evidencia + firmas + código de validación) ----------
function completarModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Completar y validar visita</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.id)} · ${esc(v.cliente)} · ${esc(v.tipo)}</p>
      <div class="field"><label>Correo del cliente (recibe el código y la orden) *</label>
        <input class="input" type="email" name="email" value="${esc(v.email || '')}" placeholder="cliente@correo.com"></div>
      <div class="field" style="margin-top:12px"><label>Observación del trabajo *</label>
        <textarea class="textarea" name="detalle" required placeholder="Trabajo realizado, equipos, mediciones…">${esc(v.detalle || '')}</textarea></div>
      <div class="field" style="margin-top:12px"><label>Evidencia fotográfica * <span class="muted-sm">(al menos una foto)</span></label><div data-photos></div></div>
      <div class="field" style="margin-top:14px"><label>Firma del cliente *</label><div data-sig-cliente></div></div>
      <div class="field" style="margin-top:6px"><label>Firma del técnico</label><div data-sig-tecnico></div></div>

      <div class="pin-box" style="margin-top:16px;border-top:1px dashed var(--border-2);padding-top:14px">
        <label style="font-size:13.5px;font-weight:700;color:var(--text)">🔐 Validación del cliente</label>
        <p class="muted-sm" style="margin:4px 0 10px">Envía un código al correo del cliente. Él te lo dicta y lo ingresas aquí para poder cerrar la visita.</p>
        <button class="btn btn-block" data-send-pin>📧 Enviar código al cliente</button>
        <div data-pin-area style="display:none;margin-top:12px">
          <div class="field"><label>Código recibido por el cliente</label>
            <input class="input" name="pin" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="6 dígitos" style="letter-spacing:6px;font-size:18px;text-align:center"></div>
          <button class="btn btn-primary btn-block" data-validar style="margin-top:10px">✓ Validar y completar</button>
          <button class="btn btn-sm btn-block" data-reenviar style="margin-top:8px">↻ Reenviar código</button>
        </div>
        <button class="btn btn-sm btn-block" data-fallback style="margin-top:10px;color:var(--text-3)">El cliente no puede darme el código — enviar a coordinación</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  const sigC = createSignaturePad('Firma del cliente');
  const sigT = createSignaturePad('Firma del técnico');
  node.querySelector('[data-sig-cliente]').appendChild(sigC.element);
  node.querySelector('[data-sig-tecnico]').appendChild(sigT.element);

  const emailEl = node.querySelector('[name=email]');
  const pinArea = node.querySelector('[data-pin-area]');
  const sendBtn = node.querySelector('[data-send-pin]');
  bindField(emailEl, { validate: validaEmail, msg: 'Correo inválido' });

  // Nota y al menos una foto son obligatorias para cerrar la visita
  const faltaNotaFoto = () => {
    const detEl = node.querySelector('[name=detalle]');
    if (!detEl.value.trim()) { toast('Escribe la observación del trabajo', 'info'); detEl.focus(); return true; }
    if (!picker.getPhotos().length) { toast('Agrega al menos una foto de evidencia', 'info'); return true; }
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

  const enviarPin = async (btn) => {
    const email = (emailEl.value || '').trim();
    if (!email) { toast('Escribe el correo del cliente para enviarle el código', 'info'); emailEl.focus(); return; }
    if (!validaEmail(email)) { toast('El correo del cliente no es válido', 'info'); emailEl.focus(); return; }
    btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enviando…';
    try {
      await store.enviarPin(uid, email);
      toast('Código enviado a ' + email + ' 📧');
      pinArea.style.display = '';
      sendBtn.style.display = 'none';
      node.querySelector('[name=pin]').focus();
    } catch (e) { toast(e.message || 'No se pudo enviar el código', 'info'); }
    btn.disabled = false; btn.textContent = orig;
  };
  sendBtn.onclick = () => enviarPin(sendBtn);
  node.querySelector('[data-reenviar]').onclick = (e) => enviarPin(e.currentTarget);

  node.querySelector('[data-validar]').onclick = async (e) => {
    if (faltaNotaFoto()) return;
    if (sigC.isEmpty()) { toast('Falta la firma del cliente', 'info'); return; }
    const pin = (node.querySelector('[name=pin]').value || '').trim();
    if (!pin) { toast('Ingresa el código que recibió el cliente', 'info'); return; }
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Validando…';
    try {
      await store.validarYCompletar(uid, { ...buildPatch({ estado: 'Completada' }, 'completada'), pin_ingresado: pin });
      toast('Visita completada y validada ✓'); closeModal();
    } catch (err) {
      toast(err.message || 'Código incorrecto', 'info');
      btn.disabled = false; btn.textContent = '✓ Validar y completar';
    }
  };

  node.querySelector('[data-fallback]').onclick = () => {
    if (faltaNotaFoto()) return;
    if (sigC.isEmpty()) { toast('Toma la firma del cliente antes de enviar a coordinación', 'info'); return; }
    if (!confirm('Se enviará a coordinación para que autoricen el cierre sin código. ¿Continuar?')) return;
    store.updateVisita(uid, buildPatch({ validada: 'pendiente' }, 'validacion_pendiente'));
    toast('Enviada a coordinación para autorizar ✓'); closeModal();
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
      <div class="field" style="margin-top:12px"><label>Evidencia fotográfica * <span class="muted-sm">(al menos una foto)</span></label><div data-photos></div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Volver</button><button class="btn btn-danger" data-save>✕ Cancelar visita</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { toast('Escribe el motivo de la cancelación', 'info'); node.querySelector('[name=motivo]').focus(); return; }
    const fotos = picker.getPhotos();
    if (!fotos.length) { toast('Agrega al menos una foto de evidencia', 'info'); return; }
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
      <div class="field" style="margin-top:12px"><label>Evidencia fotográfica * <span class="muted-sm">(al menos una foto)</span></label><div data-photos></div></div>
      <p class="muted-sm" style="margin-top:10px">Coordinación revisará tu solicitud y asignará una nueva fecha.</p>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Enviar solicitud</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { toast('Escribe el motivo de la solicitud', 'info'); node.querySelector('[name=motivo]').focus(); return; }
    const fotos = picker.getPhotos();
    if (!fotos.length) { toast('Agrega al menos una foto de evidencia', 'info'); return; }
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
