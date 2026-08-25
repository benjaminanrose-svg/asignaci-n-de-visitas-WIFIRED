// ============================================================
// WIFIRED · Vista Servicios — perfiles de cliente con cuenta PPPoE.
// Permite CORTAR o ACTIVAR el internet del cliente en el router MikroTik
// y llevar su ficha (nombre, RUT, dirección, plan, usuario PPPoE, notas).
// Sólo coordinación.
// ============================================================
import * as store from '../store.js';
import { esc, toast, formatRut } from '../util.js';
import { openModal, closeModal } from '../components.js';

const local = { q: '', servicios: [], router: false };

export async function renderServicios(root) {
  if (!store.isCoordinador()) { root.innerHTML = '<div class="empty-state"><p>Sólo la coordinación puede ver los servicios.</p></div>'; return; }
  root.innerHTML = `
    <div class="hist-intro muted-sm">📡 Perfiles de tus clientes con internet. Desde aquí puedes <b>cortar</b> o <b>activar</b> el servicio en el router.</div>
    <div class="filters">
      <div class="search-box" style="flex:1; min-width:220px; max-width:420px">
        <span class="search-ico">⌕</span>
        <input type="search" class="input" data-q placeholder="Buscar por nombre, RUT, usuario o dirección…" value="${esc(local.q)}" autocomplete="off">
      </div>
      <div class="grow"></div>
      <span data-router class="muted-sm"></span>
      <button class="btn btn-sm" data-import>⬆ Importar</button>
      <button class="btn btn-primary btn-sm" data-nuevo>＋ Nuevo servicio</button>
    </div>
    <div id="sv-host"><div class="muted-sm" style="padding:14px">Cargando…</div></div>`;

  const host = root.querySelector('#sv-host');
  root.querySelector('[data-q]').oninput = (e) => { local.q = e.target.value.trim().toLowerCase(); paint(host); };
  root.querySelector('[data-nuevo]').onclick = () => formModal(null, root);
  root.querySelector('[data-import]').onclick = () => importModal(root);

  try {
    const r = await store.listServicios();
    local.servicios = r.servicios || [];
    local.router = !!r.router;
  } catch (e) { host.innerHTML = `<div class="empty-state"><p>No se pudieron cargar los servicios.<br><span class="muted-sm">${esc(e.message || '')}</span></p></div>`; return; }

  const rEl = root.querySelector('[data-router]');
  rEl.innerHTML = local.router
    ? '<span class="tag" style="background:color-mix(in srgb,#10b981 16%,transparent);border-color:color-mix(in srgb,#10b981 40%,var(--border));color:#0f9d68">● Router conectado</span>'
    : '<span class="tag" style="background:color-mix(in srgb,#f59e0b 16%,transparent);border-color:color-mix(in srgb,#f59e0b 40%,var(--border));color:#b45309">⚠ Router sin configurar</span>';

  paint(host, root);
}

function paint(host, root) {
  let list = local.servicios.slice();
  if (local.q) list = list.filter((s) => [s.nombre, s.rut, s.pppoe_user, s.direccion, s.telefono, s.plan].some((f) => (f || '').toLowerCase().includes(local.q)));
  list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><div class="es-ico">📡</div><p>${local.q ? 'Sin resultados.' : 'Aún no hay servicios. Crea el primero con “Nuevo servicio”.'}</p></div>`;
    return;
  }
  host.innerHTML = `<div class="cli-grid">${list.map(cardHtml).join('')}</div>
    <div class="muted-sm" style="padding:14px 4px 0">${list.length} servicio${list.length === 1 ? '' : 's'}</div>`;

  host.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => accion(b.dataset.toggle, b.dataset.estado === 'activo' ? 'cortar' : 'activar', host, root)));
  host.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { const s = local.servicios.find((x) => x._uid === b.dataset.edit); if (s) formModal(s, root); }));
}

function cardHtml(s) {
  const cortado = s.estado === 'cortado';
  const badge = cortado
    ? '<span class="tag" style="background:color-mix(in srgb,#ef4444 16%,transparent);border-color:color-mix(in srgb,#ef4444 40%,var(--border));color:#dc2626">✕ Cortado</span>'
    : '<span class="tag" style="background:color-mix(in srgb,#10b981 16%,transparent);border-color:color-mix(in srgb,#10b981 40%,var(--border));color:#0f9d68">● Activo</span>';
  const ident = [s.rut ? '🪪 ' + esc(formatRut(s.rut)) : '', s.telefono ? '📞 ' + esc(s.telefono) : ''].filter(Boolean).join('  ·  ');
  return `
    <div class="card cli-card">
      <div class="row" style="gap:10px; align-items:flex-start">
        <div style="flex:1; min-width:0">
          <div class="cell-strong truncate">${esc(s.nombre || 'Sin nombre')}</div>
          ${ident ? `<div class="cell-sub truncate">${ident}</div>` : ''}
          ${s.direccion ? `<div class="cell-sub truncate">📍 ${esc(s.direccion)}</div>` : ''}
          <div class="cell-sub truncate">👤 PPPoE: <b>${esc(s.pppoe_user || '—')}</b>${s.plan ? ' · 📶 ' + esc(s.plan) : ''}</div>
        </div>
        ${badge}
      </div>
      <div class="row" style="gap:8px; margin-top:12px">
        <button class="btn btn-sm ${cortado ? 'btn-primary' : 'btn-danger'}" data-toggle="${esc(s._uid)}" data-estado="${esc(s.estado)}">${cortado ? '▶ Activar internet' : '⛔ Cortar internet'}</button>
        <button class="btn btn-sm" data-edit="${esc(s._uid)}">✎ Editar</button>
      </div>
    </div>`;
}

async function accion(uid, acc, host, root) {
  const s = local.servicios.find((x) => x._uid === uid);
  if (!s) return;
  if (!s.pppoe_user) { toast('Primero agrega el usuario PPPoE (toca Editar)', 'info'); formModal(s, root); return; }
  if (!local.router) { toast('El router no está configurado en el servidor (faltan datos del MikroTik)', 'info'); return; }
  const verbo = acc === 'cortar' ? 'CORTAR' : 'ACTIVAR';
  if (!confirm(`¿${verbo} el internet de "${s.nombre}" (usuario ${s.pppoe_user})?`)) return;
  const btn = host.querySelector(`[data-toggle="${uid}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const out = await store.servicioAccion(uid, acc);
    const idx = local.servicios.findIndex((x) => x._uid === uid);
    if (idx >= 0 && out) local.servicios[idx] = out;
    toast(acc === 'cortar' ? 'Internet cortado ✓' : 'Internet activado ✓');
  } catch (e) {
    toast(e.message || 'No se pudo comunicar con el router', 'info');
  }
  paint(host, root);
}

function formModal(s, root) {
  const nuevo = !s;
  const v = s || { nombre: '', rut: '', telefono: '', direccion: '', email: '', plan: '', pppoe_user: '', notas: '' };
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="modal-head"><h3>${nuevo ? 'Nuevo servicio' : 'Editar servicio'}</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Nombre del cliente *</label><input class="input" data-f="nombre" value="${esc(v.nombre)}" placeholder="Ej: Juan Pérez"></div>
      <div class="form-grid">
        <div class="field"><label>RUT</label><input class="input" data-f="rut" value="${esc(v.rut)}" placeholder="12.345.678-9"></div>
        <div class="field"><label>Teléfono</label><input class="input" data-f="telefono" value="${esc(v.telefono)}" placeholder="+569…"></div>
      </div>
      <div class="field"><label>Dirección</label><input class="input" data-f="direccion" value="${esc(v.direccion)}" placeholder="Calle, número, sector"></div>
      <div class="form-grid">
        <div class="field"><label>Plan</label><input class="input" data-f="plan" value="${esc(v.plan)}" placeholder="Ej: Full 940 Mbps"></div>
        <div class="field"><label>Correo</label><input class="input" data-f="email" value="${esc(v.email)}" placeholder="correo@…"></div>
      </div>
      <div class="field"><label>Usuario PPPoE * <span class="muted-sm">(el mismo que tiene en el router MikroTik)</span></label>
        <input class="input" data-f="pppoe_user" value="${esc(v.pppoe_user)}" placeholder="Ej: juanperez" autocapitalize="none"></div>
      <div class="field"><label>Notas</label><textarea class="textarea" data-f="notas" placeholder="Observaciones internas…">${esc(v.notas)}</textarea></div>
    </div>
    <div class="modal-foot">
      ${nuevo ? '' : '<button class="btn btn-danger" data-del>Eliminar</button>'}
      <div class="grow"></div>
      <button class="btn" data-x2>Cancelar</button>
      <button class="btn btn-primary" data-save>${nuevo ? 'Crear servicio' : 'Guardar'}</button>
    </div>`;
  openModal(box, 'md', { dismissable: false });
  const cerrar = () => closeModal();
  box.querySelector('[data-x]').onclick = cerrar;
  box.querySelector('[data-x2]').onclick = cerrar;

  box.querySelector('[data-save]').onclick = async () => {
    const data = {};
    box.querySelectorAll('[data-f]').forEach((el) => (data[el.dataset.f] = el.value.trim()));
    if (!data.nombre) { toast('El nombre es obligatorio', 'info'); return; }
    const btn = box.querySelector('[data-save]'); btn.disabled = true;
    try {
      const out = nuevo ? await store.addServicio(data) : await store.updateServicio(s._uid, data);
      if (nuevo) local.servicios.push(out);
      else { const i = local.servicios.findIndex((x) => x._uid === s._uid); if (i >= 0) local.servicios[i] = out; }
      toast(nuevo ? 'Servicio creado ✓' : 'Guardado ✓');
      cerrar(); renderServicios(root);
    } catch (e) { toast(e.message || 'No se pudo guardar', 'info'); btn.disabled = false; }
  };

  if (!nuevo) box.querySelector('[data-del]').onclick = async () => {
    if (!confirm(`¿Eliminar el servicio de "${s.nombre}"? (no corta el internet, solo borra la ficha)`)) return;
    try {
      await store.deleteServicio(s._uid);
      local.servicios = local.servicios.filter((x) => x._uid !== s._uid);
      toast('Servicio eliminado ✓'); cerrar(); renderServicios(root);
    } catch (e) { toast(e.message || 'No se pudo eliminar', 'info'); }
  };
}

// ---------- Importar (CSV de MikroWisp o plantilla propia) ----------
// Mapea cabeceras conocidas (MikroWisp y las nuestras) a los campos del servicio.
const COL_MAP = {
  'nombre': 'nombre', 'name': 'nombre', 'cliente': 'nombre',
  'cedula': 'rut', 'cédula': 'rut', 'rut': 'rut', 'dni': 'rut',
  'movil': 'telefono', 'móvil': 'telefono', 'celular': 'telefono', 'telefono': 'telefono', 'teléfono': 'telefono', 'fono': 'telefono',
  'user ppp/hotspot': 'pppoe_user', 'user ppp': 'pppoe_user', 'pppoe': 'pppoe_user', 'pppoe_user': 'pppoe_user', 'usuario': 'pppoe_user', 'usuario ppp': 'pppoe_user',
  'plan': 'plan',
  'dirección principal': 'direccion', 'direccion principal': 'direccion', 'dirección servicio': 'direccion', 'direccion servicio': 'direccion', 'direccion': 'direccion', 'dirección': 'direccion', 'direccion_servicio': 'direccion',
  'router': 'nodo', 'nodo': 'nodo',
  'ip': 'ip',
  'dia pago': 'dia_pago', 'día pago': 'dia_pago', 'dia_pago': 'dia_pago', 'dia de pago': 'dia_pago',
  'id': 'mikrowisp_id', 'mikrowisp_id': 'mikrowisp_id', 'id mikrowisp': 'mikrowisp_id',
  'correo': 'email', 'email': 'email', 'e-mail': 'email',
  'notas': 'notas', 'nota': 'notas', 'observaciones': 'notas',
};
/** Parser CSV mínimo con soporte de comillas. Detecta separador , o ; */
function parseCSV(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
  const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => (c || '').trim() !== ''));
}
/** Convierte filas CSV a objetos con nuestros campos, según la cabecera. */
function csvAObjetos(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  // busca la fila de cabecera (la que tenga 'nombre' o 'user ppp')
  let h = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const low = rows[i].map((c) => (c || '').trim().toLowerCase());
    if (low.some((c) => COL_MAP[c])) { h = i; break; }
  }
  const cols = rows[h].map((c) => COL_MAP[(c || '').trim().toLowerCase()] || null);
  const out = [];
  for (let i = h + 1; i < rows.length; i++) {
    const o = {};
    rows[i].forEach((val, j) => {
      const field = cols[j]; const v = (val || '').trim();
      if (field && v) o[field] = v; // valor no vacío pisa a anterior (prioridad por orden de columnas)
    });
    if (o.nombre || o.pppoe_user || o.rut) out.push(o);
  }
  return out;
}

function importModal(root) {
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="modal-head"><h3>Importar clientes</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-body">
      <p class="muted-sm">Sube el archivo <b>.csv</b> exportado de MikroWisp (o pega el contenido). Si un cliente ya existe, solo se rellenan sus datos faltantes; <b>no se pierde nada</b>.</p>
      <div class="field"><label>Archivo CSV</label><input type="file" accept=".csv,text/csv" data-file></div>
      <div class="field"><label>…o pega aquí el CSV</label><textarea class="textarea" data-paste placeholder="nombre,rut,telefono,pppoe_user,plan…" style="min-height:120px"></textarea></div>
      <div class="muted-sm" data-prev></div>
      <p class="muted-sm">💡 ¿Tienes el archivo en Excel (.xlsx)? Ábrelo → <b>Archivo → Guardar como → CSV</b>, y sube ese CSV.</p>
    </div>
    <div class="modal-foot">
      <div class="grow"></div>
      <button class="btn" data-x2>Cancelar</button>
      <button class="btn btn-primary" data-go disabled>Importar</button>
    </div>`;
  openModal(box, 'md', { dismissable: false });
  const cerrar = () => closeModal();
  box.querySelector('[data-x]').onclick = cerrar;
  box.querySelector('[data-x2]').onclick = cerrar;
  const prev = box.querySelector('[data-prev]');
  const go = box.querySelector('[data-go]');
  let registros = [];

  const analizar = (text) => {
    try { registros = csvAObjetos(text); } catch (e) { registros = []; }
    if (registros.length) { prev.innerHTML = `✅ Se detectaron <b>${registros.length}</b> clientes listos para importar.`; go.disabled = false; }
    else { prev.innerHTML = '⚠️ No se detectaron filas válidas. Revisa que el archivo tenga cabeceras (Nombre, Cedula, Movil, User PPP/Hotspot…).'; go.disabled = true; }
  };
  box.querySelector('[data-file]').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => { box.querySelector('[data-paste]').value = ''; analizar(String(rd.result || '')); }; rd.readAsText(f, 'utf-8');
  };
  box.querySelector('[data-paste]').oninput = (e) => analizar(e.target.value);

  go.onclick = async () => {
    if (!registros.length) return;
    go.disabled = true;
    const total = registros.length; let creados = 0, actualizados = 0, sinCambios = 0, hechos = 0;
    try {
      for (let i = 0; i < registros.length; i += 400) {
        const lote = registros.slice(i, i + 400);
        const r = await store.importServicios(lote);
        creados += r.creados || 0; actualizados += r.actualizados || 0; sinCambios += r.sinCambios || 0;
        hechos += lote.length;
        prev.innerHTML = `Importando… ${hechos}/${total}`;
      }
      toast(`Importados ✓ — ${creados} nuevos, ${actualizados} actualizados`);
      cerrar(); renderServicios(root);
    } catch (e) {
      toast(e.message || 'No se pudo importar', 'info'); go.disabled = false;
    }
  };
}
