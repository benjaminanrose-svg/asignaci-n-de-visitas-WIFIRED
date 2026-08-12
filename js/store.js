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

let state = { visitas: [], tecnicos: [], config: { bloques: [], tipos: [], estados: [] } };
let me = null;
let persistent = true;
let queue = load(QUEUE, []);
const listeners = new Set();

function load(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } }
function saveQueue() { try { localStorage.setItem(QUEUE, JSON.stringify(queue)); } catch (e) {} }
function saveCache() { try { localStorage.setItem(CACHE, JSON.stringify({ visitas: state.visitas, tecnicos: state.tecnicos, config: state.config, me })); } catch (e) {} }

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
    state.visitas = data.visitas; state.tecnicos = data.tecnicos; state.config = data.config; me = data.me || null;
    persistent = data.persistent !== false;
    saveCache();
    flushQueue();
  } catch (e) {
    if (e.auth) throw e;
    const c = load(CACHE, null); // sin conexión: usar caché
    if (c) { state.visitas = c.visitas; state.tecnicos = c.tecnicos; state.config = c.config; me = c.me; }
    else throw e;
  }
  return state;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { saveCache(); listeners.forEach((fn) => fn(state)); }

// ---------- Getters ----------
export function getState() { return state; }
export const company = COMPANY;
export function visitas() { return state.visitas; }
export function byUid(uid) { return state.visitas.find((v) => v._uid === uid); }
export function tecnicosList() { return state.tecnicos; }
export function tecnicos() { return state.tecnicos.filter((t) => t.activo).map((t) => t.display); }
export function tipos() { return state.config.tipos; }
export function bloques() { return state.config.bloques; }
export function estados() { return state.config.estados; }

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

// ---------- Reconexión ----------
window.addEventListener('online', () => { flushQueue(); emit(); });
window.addEventListener('offline', () => emit());
