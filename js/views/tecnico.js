// ============================================================
// WIFIRED · Portal del Técnico — sus visitas asignadas
// ============================================================
import * as store from '../store.js';
import { esc, fmtDate, fmtDateShort, todayISO, bloqueShort, toast } from '../util.js';
import { statusBadge, openModal, closeModal } from '../components.js';

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
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.bloque || '').localeCompare(b.bloque || ''));

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
    if (act === 'completar') {
      store.updateVisita(uid, { estado: 'Completada' }); toast('Visita marcada como completada');
    } else if (act === 'solicitar') { solicitarModal(uid); }
    else if (act === 'nota') { notaModal(uid); }
  }));
}

function tab(k, label, n) {
  return `<button class="tec-tab ${local.filtro === k ? 'active' : ''}" data-tab="${k}">${esc(label)}<span class="tec-tab-n">${n}</span></button>`;
}

function card(v) {
  const done = v.estado === 'Completada';
  const pedida = !!v.reagenda_solicitada;
  const tel = (v.telefono || '').split('/')[0].replace(/\s/g, '');
  return `
  <div class="tec-card ${done ? 'done' : ''}">
    <div class="tec-card-top">
      <div class="row" style="gap:8px; flex-wrap:wrap">
        <span class="tag tag-block">${esc(bloqueShort(v.bloque))}</span>
        <span class="tec-fecha">${esc(fmtDateShort(v.fecha))}</span>
      </div>
      ${statusBadge(v.estado)}
    </div>
    <div class="tec-client">${esc(v.cliente || 'Sin nombre')}</div>
    <div class="tec-type">${esc(v.tipo || '—')}</div>
    ${v.direccion ? `<div class="tec-meta">📍 ${esc(v.direccion)}</div>` : ''}
    ${v.telefono ? `<div class="tec-meta">📞 <a href="tel:${esc(tel)}">${esc(v.telefono)}</a></div>` : ''}
    ${v.detalle ? `<div class="tec-note">📝 ${esc(v.detalle)}</div>` : ''}
    ${pedida ? `<div class="tec-req">⏳ Reagenda solicitada — a la espera de nueva fecha por coordinación</div>` : ''}
    <div class="tec-actions">
      ${done ? '' : `<button class="btn btn-primary btn-sm" data-act="completar" data-uid="${esc(v._uid)}">✓ Completar</button>`}
      ${done || pedida ? '' : `<button class="btn btn-sm" data-act="solicitar" data-uid="${esc(v._uid)}">↻ Solicitar reagenda</button>`}
      <button class="btn btn-sm" data-act="nota" data-uid="${esc(v._uid)}">📝 Nota</button>
    </div>
  </div>`;
}

// ---------- Solicitar reagenda (el coordinador asigna la nueva fecha) ----------
function solicitarModal(uid) {
  const v = store.byUid(uid); if (!v) return;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Solicitar reagenda</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm" style="margin-bottom:14px">${esc(v.cliente)} · ${esc(v.tipo)}</p>
      <div class="field"><label>Motivo de la solicitud</label>
        <textarea class="textarea" name="motivo" style="min-height:110px" placeholder="Ej: cliente no se encontraba, falta de poste, coordinar otro día…" required></textarea></div>
      <p class="muted-sm" style="margin-top:10px">Coordinación revisará tu solicitud y asignará una nueva fecha.</p>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Enviar solicitud</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  node.querySelector('[data-save]').onclick = () => {
    const motivo = node.querySelector('[name=motivo]').value.trim();
    if (!motivo) { node.querySelector('[name=motivo]').focus(); return; }
    store.updateVisita(uid, { reagenda_solicitada: 'true', reagenda_motivo: motivo });
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
