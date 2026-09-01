// ============================================================
// WIFIRED · Store — API REST + caché local + cola offline
// Permite completar tareas sin conexión y sincroniza al volver.
// ============================================================
import { toast } from './util.js';
import { getToken, logout } from './auth.js';

const COMPANY = {
  nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
  direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
  fonos: ['569 89798503', '569 99967675'],
  email: 'Soporte@wifired.cl',
  autoriza: 'Martin Ballesteros Escarate',
};
const CACHE = 'wifired_cache';
const QUEUE = 'wifired_queue';

/** Aplica la empresa desde la config (si viene) sobre los datos por defecto */
function applyCompany() {
  const e = state.config && state.config.empresa;
  company = e ? { ...COMPANY, ...e, fonos: Array.isArray(e.fonos) && e.fonos.length ? e.fonos : COMPANY.fonos } : { ...COMPANY };
}

let state = { visitas: [], tecnicos: [], tickets: [], config: { bloques: [], tipos: [], estados: [], prioridades: ['Alta', 'Media', 'Baja'], nodos: [], empresa: null } };
let me = null;
let persistent = true;
let queue = load(QUEUE, []);
const listeners = new Set();

function load(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } }
function saveQueue() { try { localStorage.setItem(QUEUE, JSON.stringify(queue)); } catch (e) {} }
function saveCache() { try { localStorage.setItem(CACHE, JSON.stringify({ visitas: state.visitas, tecnicos: state.tecnicos, tickets: state.tickets, config: state.config, me })); } catch (e) {} }

export function currentUser() { return me; }
export function isCoordinador() { return me && me.rol === 'coordinador'; }
export function isOnline() { return navigator.onLine; }
export function isPersistent() { return persistent; }
export function pendingCount() { return queue.length; }

// ---------- fetch de bajo nivel (distingue fallo de red) ----------
async function rawApi(method, url, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  const tk = getToken();
  if (tk) opt.headers.Authorization = 'Bearer ' + tk;
  if (body) opt.body = JSON.stringify(body);
  let res;
  try { res = await fetch('/api' + url, opt); }
  catch (e) { const err = new Error('Sin conexión'); err.network = true; throw err; }
  if (res.status === 401) { logout(); const e = new Error('Sesión expirada'); e.auth = true; throw e; }
  if (!res.ok) {
    let msg = 'Error de servidor';
    try { msg = (await res.json()).error || msg; } catch (e) {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.status === 204 ? null : res.json();
}

export async function initStore() {
  try {
    const data = await rawApi('GET', '/bootstrap');
    state.visitas = data.visitas; state.tecnicos = data.tecnicos; state.tickets = data.tickets || []; state.config = data.config; me = data.me || null;
    persistent = data.persistent !== false;
    applyCompany();
    saveCache();
    flushQueue();
  } catch (e) {
    if (e.auth) throw e;
    const c = load(CACHE, null); // sin conexión: usar caché
    if (c) { state.visitas = c.visitas; state.tecnicos = c.tecnicos; state.tickets = c.tickets || []; state.config = c.config; me = c.me; applyCompany(); }
    else throw e;
  }
  return state;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { saveCache(); listeners.forEach((fn) => fn(state)); }

// ---------- Getters ----------
export function getState() { return state; }
export let company = { ...COMPANY };
export function visitas() { return state.visitas; }
export function byUid(uid) { return state.visitas.find((v) => v._uid === uid); }

// Reordena varias visitas de una (el orden en que las ve el técnico).
// Asigna orden 1..N según el arreglo de _uid recibido; optimista + 1 sola petición.
export async function reordenarVisitas(uids) {
  uids.forEach((uid, i) => {
    const idx = state.visitas.findIndex((v) => v._uid === uid);
    if (idx >= 0) state.visitas[idx] = { ...state.visitas[idx], orden: i + 1 };
  });
  emit();
  try { await rawApi('POST', '/visitas/orden', { uids }); }
  catch (e) { if (e.network) enqueue({ method: 'POST', url: '/visitas/orden', body: { uids } }); else toast(e.message || 'No se pudo guardar el orden', 'info'); }
}
export function tecnicosList() { return state.tecnicos; }
export function tecnicos() { return state.tecnicos.filter((t) => t.activo).map((t) => t.display); }
export function tipos() { return state.config.tipos; }
export function bloques() { return state.config.bloques; }
export function estados() { return state.config.estados; }
export function prioridades() { return (state.config.prioridades && state.config.prioridades.length) ? state.config.prioridades : ['Alta', 'Media', 'Baja']; }
export function nodos() { return state.config.nodos || []; }
export function configFull() { return state.config; }

// ---------- Cola offline ----------
function enqueue(op) {
  op.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  queue.push(op); saveQueue(); emit(); // refresca contador de la barra
  if (navigator.onLine) setTimeout(flushQueue, 300);
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !navigator.onLine || !queue.length) return;
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      try {
        const updated = await rawApi(op.method, op.url, op.body);
        if (updated && updated._uid) {
          const i = state.visitas.findIndex((v) => v._uid === updated._uid);
          if (i >= 0) state.visitas[i] = updated;
        }
        queue.shift(); saveQueue();
      } catch (e) {
        if (e.network) break;        // sigue sin conexión → reintentar luego
        queue.shift(); saveQueue();  // rechazo del servidor → descartar
      }
    }
  } finally { flushing = false; emit(); }
}

// ---------- Visitas ----------
export async function updateVisita(uid, patch) {
  const idx = state.visitas.findIndex((v) => v._uid === uid);
  if (idx < 0) return;
  const prev = state.visitas[idx];
  state.visitas[idx] = { ...prev, ...patch }; // optimista
  emit();
  try {
    const updated = await rawApi('PUT', '/visitas/' + uid, patch);
    if (updated._email) {
      if (updated._email.ok) toast('Orden enviada al cliente por correo ✉️');
      else toast('Visita completada. Correo no enviado: ' + updated._email.reason, 'info');
      delete updated._email;
    }
    state.visitas[idx] = updated; emit();
  } catch (e) {
    if (e.network) { enqueue({ method: 'PUT', url: '/visitas/' + uid, body: patch }); } // conservar cambio local
    else { state.visitas[idx] = prev; emit(); toast(e.message, 'info'); }
  }
}

export async function addVisita(data) {
  try {
    const v = await rawApi('POST', '/visitas', data);
    state.visitas.unshift(v); emit();
    return v;
  } catch (e) { toast(e.network ? 'Sin conexión: no se puede crear visitas offline' : e.message, 'info'); throw e; }
}

export async function enviarOrden(uid) {
  return rawApi('POST', '/visitas/' + uid + '/enviar-orden');
}

/** Pide al cliente (por WhatsApp, vía bot) que confirme su visita — ahora mismo */
export async function pedirConfirmacionVisita(uid) {
  return rawApi('POST', '/visitas/' + uid + '/confirmar-ahora');
}

/** Envía el código (PIN) de validación al correo del cliente */
export async function enviarPin(uid, email) {
  return rawApi('POST', '/visitas/' + uid + '/enviar-pin', email ? { email } : undefined);
}

/** Obtiene un respaldo completo de los registros (sólo coordinación) */
export async function getBackup() { return rawApi('GET', '/backup'); }

/** Vacía TODO el historial de visitas (irreversible, sólo coordinación) */
export async function limpiarHistorial() {
  const r = await rawApi('POST', '/visitas/limpiar-todo', { confirmar: 'BORRAR TODO' });
  state.visitas = []; emit();
  return r;
}

/** Descarga la orden de trabajo en PDF (la misma que se envía al cliente/soporte). Devuelve Uint8Array */
export async function ordenPdfBytes(uid) {
  const tk = getToken();
  const res = await fetch('/api/visitas/' + uid + '/orden.pdf', { headers: tk ? { Authorization: 'Bearer ' + tk } : {} });
  if (!res.ok) { let m = 'No se pudo generar la OT'; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
  return new Uint8Array(await res.arrayBuffer());
}

/** Completa una visita validando con el PIN (requiere conexión; no se encola) */
export async function validarYCompletar(uid, patch) {
  const idx = state.visitas.findIndex((v) => v._uid === uid);
  const updated = await rawApi('PUT', '/visitas/' + uid, patch); // lanza si el código es inválido
  if (updated._email) {
    if (updated._email.ok) toast('Orden enviada al cliente por correo ✉️');
    else toast('Visita completada. Correo no enviado: ' + updated._email.reason, 'info');
    delete updated._email;
  }
  if (idx >= 0) state.visitas[idx] = updated; emit();
  return updated;
}

export async function deleteVisita(uid) {
  const prev = state.visitas.slice();
  state.visitas = state.visitas.filter((v) => v._uid !== uid); emit();
  try { await rawApi('DELETE', '/visitas/' + uid); }
  catch (e) { state.visitas = prev; emit(); toast(e.message, 'info'); }
}

// ---------- Técnicos ----------
export async function addTecnico(data) {
  try {
    const t = await rawApi('POST', '/tecnicos', data);
    state.tecnicos.push(t); emit(); return t;
  } catch (e) { toast(e.message, 'info'); throw e; }
}
export async function updateTecnico(id, patch) {
  try {
    const idx = state.tecnicos.findIndex((t) => t.id == id);
    const t = await rawApi('PUT', '/tecnicos/' + id, patch);
    if (idx >= 0) state.tecnicos[idx] = t; emit(); return t;
  } catch (e) { toast(e.message, 'info'); throw e; }
}
export async function deleteTecnico(id) {
  const prev = state.tecnicos.slice();
  state.tecnicos = state.tecnicos.filter((t) => t.id != id); emit();
  try { await rawApi('DELETE', '/tecnicos/' + id); }
  catch (e) { state.tecnicos = prev; emit(); toast(e.message, 'info'); }
}

// ---------- Tickets de atención ----------
export function ticketsList() { return state.tickets; }
export function ticketByUid(uid) { return state.tickets.find((t) => t._uid === uid); }

export async function addTicket(data) {
  try {
    const t = await rawApi('POST', '/tickets', data);
    state.tickets.unshift(t); emit();
    return t;
  } catch (e) { toast(e.message, 'info'); throw e; }
}

export async function updateTicket(uid, patch) {
  const idx = state.tickets.findIndex((t) => t._uid === uid);
  const prev = idx >= 0 ? state.tickets[idx] : null;
  if (idx >= 0) { state.tickets[idx] = { ...prev, ...patch }; emit(); } // optimista
  try {
    const t = await rawApi('PUT', '/tickets/' + uid, patch);
    if (idx >= 0) state.tickets[idx] = t;
    emit();
    return t;
  } catch (e) {
    if (idx >= 0 && prev) { state.tickets[idx] = prev; emit(); }
    toast(e.message, 'info'); throw e;
  }
}

export async function deleteTicket(uid) {
  const prev = state.tickets.slice();
  state.tickets = state.tickets.filter((t) => t._uid !== uid); emit();
  try { await rawApi('DELETE', '/tickets/' + uid); }
  catch (e) { state.tickets = prev; emit(); toast(e.message, 'info'); }
}

/** Envía los planes al cliente por WhatsApp (encola el mensaje para el bot) */
export async function enviarPlanes(uid) {
  const r = await rawApi('POST', '/tickets/' + uid + '/enviar-planes');
  if (r && r.ticket) {
    const idx = state.tickets.findIndex((t) => t._uid === uid);
    if (idx >= 0) state.tickets[idx] = r.ticket;
    emit();
  }
  return r;
}

// ---------- Servicios (perfiles PPPoE + control del router) ----------
export async function listServicios() { return rawApi('GET', '/servicios'); }
export async function addServicio(data) { return rawApi('POST', '/servicios', data); }
export async function updateServicio(id, patch) { return rawApi('PUT', '/servicios/' + id, patch); }
export async function deleteServicio(id) { return rawApi('DELETE', '/servicios/' + id); }
export async function servicioAccion(id, accion) { return rawApi('POST', '/servicios/' + id + '/' + accion); }
export async function importServicios(rows) { return rawApi('POST', '/servicios/import', { rows }); }
export async function broadcast(payload) { return rawApi('POST', '/servicios/broadcast', payload); }
export async function reportarUbicacion(lat, lng) { return rawApi('POST', '/tecnico/ubicacion', { lat, lng }); }
export async function ubicacionesTecnicos() { return rawApi('GET', '/tecnicos/ubicaciones'); }
export async function listContactos() { return rawApi('GET', '/contactos'); }
export async function marcarContacto(telefono, baja) { return rawApi('POST', '/contactos/marcar', { telefono, baja }); }
export async function marcarAnuncios(telefono, quiere) { return rawApi('POST', '/contactos/marcar', { telefono, anuncios: quiere }); }
export async function broadcastPendientes() { return rawApi('GET', '/servicios/broadcast/pendientes'); }
export async function broadcastCancelar() { return rawApi('POST', '/servicios/broadcast/cancelar'); }
export async function routerEstado() { return rawApi('GET', '/router/estado'); }
export async function cambiarClave(actual, nueva) { return rawApi('POST', '/mi-clave', { actual, nueva }); }

// ---------- Configuración ----------
export async function saveConfig(patch) {
  const nueva = await rawApi('PUT', '/config', patch);
  state.config = nueva; applyCompany(); emit();
  return nueva;
}

// ---------- Chequeo ligero de cambios (para refrescar sólo cuando hace falta) ----------
export async function checkRev() {
  const r = await rawApi('GET', '/rev');
  return r && r.rev;
}

// ---------- Auto-actualización (multi-usuario) ----------
function signature() {
  return state.visitas.map((v) => v._uid + v.estado + v.tecnico + v.fecha + v.prioridad + (v.reagenda_solicitada ? '1' : '0') + (v.evidencias ? v.evidencias.length : 0)).join('|')
    + '#' + state.tecnicos.map((t) => t.id + (t.activo ? '1' : '0') + t.display).join('|')
    + '@' + (state.tickets || []).map((t) => t._uid + t.estado + t.factibilidad + t.categoria + (t.updated_at || '')).join('|');
}
/** Refresca datos desde el servidor; re-renderiza sólo si algo cambió */
export async function refresh() {
  if (!navigator.onLine || queue.length) return;
  let data;
  try { data = await rawApi('GET', '/bootstrap'); } catch (e) { return; }
  const before = signature();
  state.visitas = data.visitas; state.tecnicos = data.tecnicos; state.tickets = data.tickets || []; state.config = data.config;
  me = data.me || me; persistent = data.persistent !== false;
  applyCompany();
  if (signature() !== before) emit(); else saveCache();
}

// ---------- Reconexión ----------
window.addEventListener('online', () => { flushQueue(); emit(); });
window.addEventListener('offline', () => emit());
