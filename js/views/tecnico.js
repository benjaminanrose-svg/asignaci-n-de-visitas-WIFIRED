// ============================================================
// WIFIRED · Portal del Técnico — sus visitas asignadas
// ============================================================
import * as store from '../store.js';
import { esc, fmtDate, fmtDateShort, todayISO, bloqueShort, toast, prioRank, telLink, waLink } from '../util.js';
import { statusBadge, priorityTag, openModal, closeModal } from '../components.js';
import { createPhotoPicker, openPhoto } from '../photos.js';

/** Une evidencias existentes con las nuevas fotos y devuelve JSON */
function evJSON(v, photos, tipo) {
  const prev = Array.isArray(v.evidencias) ? v.evidencias : [];
  const add = photos.map((url) => ({ url, ts: Date.now(), tipo }));
  return JSON.stringify(prev.concat(add));
}

const local = { filtro: 'hoy' };

export function renderTecnico(root) {
  const user = store.currentUser() || {};
  const all = store.visitas();
  const today = todayISO();
  const activas = (v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado);

  const filtros = {
    hoy: (v) => v.fecha === today && activas(v),
    proximas: (v) => v.fecha >= today && activas(v),
    pendientes: (v) => activas(v),
    completadas: (v) => v.estado === 'Completada',
    todas: () => true,
  };
  let list = all.filter(filtros[local.filtro] || (() => true))
    .sort((a, b) => prioRank(a.prioridad) - prioRank(b.prioridad) || (a.fecha || '').localeCompare(b.fecha || '') || (a.bloque || '').localeCompare(b.bloque || ''));

  const count = (k) => all.filter(filtros[k]).length;

  const online = store.isOnline();
  const pend = store.pendingCount();
  let syncBar = '';
  if (!online) syncBar = `<div class="sync-bar off">📴 Sin conexión — ${pend} cambio(s) se enviarán al reconectar</div>`;
  else if (pend > 0) syncBar = `<div class="sync-bar syncing">⟳ Sincronizando ${pend} cambio(s)…</div>`;

  root.innerHTML = `
    ${syncBar}
    <div class="tec-hero">
      <div>
        <div class="tec-hello">Hola, ${esc((user.nombre || '').replace(/^(Técnico|Ingeniero|Soporte de Emergencia|Soporte|Planta Externa)\s*/, '') || user.nombre)} 👋</div>
        <div class="muted-sm">${all.filter(filtros.hoy).length} visita(s) para hoy · ${fmtDate(today, true)}</div>
      </div>
    </div>

    <div class="tec-tabs">
      ${tab('hoy', 'Hoy', count('hoy'))}
      ${tab('proximas', 'Próximas', count('proximas'))}
      ${tab('pendientes', 'Pendientes', count('pendientes'))}
      ${tab('completadas', 'Completadas', count('completadas'))}
      ${tab('todas', 'Todas', all.length)}
    </div>

    <div class="tec-list">
      ${list.length ? list.map(card).join('') : `<div class="empty-state"><div class="es-ico">✓</div><p>No tienes visitas en esta sección.</p></div>`}
    </div>`;

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
    ${v.direccion ? `<div class="tec-meta">📍 ${esc(v.direccion)}</div>` : ''}
    ${v.telefono ? `<div class="tec-meta">📞 <a href="${telLink(v.telefono)}">${esc(v.telefono)}</a> · <a href="${waLink(v.telefono, `Hola ${v.cliente || ''}, le contactamos de WIFIRED por su visita técnica.`)}" target="_blank" rel="noopener" style="color:#128c7e">WhatsApp</a></div>` : ''}
    ${v.detalle ? `<div class="tec-note">📝 ${esc(v.detalle)}</div>` : ''}
    ${pedida ? `<div class="tec-req">⏳ Reagenda solicitada — a la espera de nueva fecha por coordinación</div>` : ''}
    ${nFotos ? `<button class="tec-fotos" data-act="ver-fotos" data-uid="${esc(v._uid)}">📷 ${nFotos} foto${nFotos === 1 ? '' : 's'} de evidencia</button>` : ''}
    <div class="tec-actions">
      ${cerrada ? '' : `<button class="btn btn-primary btn-sm" data-act="completar" data-uid="${esc(v._uid)}">✓ Completar</button>`}
      ${cerrada || pedida ? '' : `<button class="btn btn-sm" data-act="solicitar" data-uid="${esc(v._uid)}">↻ Reagenda</button>`}
      ${cerrada ? '' : `<button class="btn btn-sm btn-danger" data-act="cancelar" data-uid="${esc(v._uid)}">✕ Cancelar</button>`}
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

// ---------- Completar (con evidencia) ----------
function completarModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Completar visita</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.cliente)} · ${esc(v.tipo)}</p>
      <div class="field"><label>Observación (opcional)</label>
        <textarea class="textarea" name="detalle" placeholder="Trabajo realizado, equipos, mediciones…">${esc(v.detalle || '')}</textarea></div>
      <div class="field" style="margin-top:12px"><label>Evidencia fotográfica</label><div data-photos></div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>✓ Marcar completada</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    store.updateVisita(uid, {
      estado: 'Completada',
      detalle: node.querySelector('[name=detalle]').value,
      evidencias: evJSON(v, picker.getPhotos(), 'completada'),
    });
    toast('Visita completada'); closeModal();
  };
  openModal(node, 'md');
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
      <div class="field" style="margin-top:12px"><label>Evidencia fotográfica (opcional)</label><div data-photos></div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Volver</button><button class="btn btn-danger" data-save>✕ Cancelar visita</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { node.querySelector('[name=motivo]').focus(); return; }
    store.updateVisita(uid, { estado: 'Cancelada', detalle: motivo, evidencias: evJSON(v, picker.getPhotos(), 'cancelada') });
    toast('Visita cancelada', 'info'); closeModal();
  };
  openModal(node, 'md');
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
      <div class="field" style="margin-top:12px"><label>Evidencia fotográfica (opcional)</label><div data-photos></div></div>
      <p class="muted-sm" style="margin-top:10px">Coordinación revisará tu solicitud y asignará una nueva fecha.</p>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Enviar solicitud</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const picker = attachPicker(node);
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { node.querySelector('[name=motivo]').focus(); return; }
    store.updateVisita(uid, { reagenda_solicitada: 'true', reagenda_motivo: motivo, evidencias: evJSON(v, picker.getPhotos(), 'reagenda') });
    toast('Solicitud de reagenda enviada'); closeModal();
  };
  openModal(node, 'md');
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
    store.updateVisita(uid, { detalle: node.querySelector('[name=detalle]').value });
    toast('Nota guardada'); closeModal();
  };
  openModal(node, 'md');
}
