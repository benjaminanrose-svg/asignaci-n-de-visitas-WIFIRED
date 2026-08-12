// ============================================================
// WIFIRED · Store — estado en memoria sincronizado con la API REST
// ============================================================
import { toast } from './util.js';
import { getToken, logout } from './auth.js';

let me = null;
export function currentUser() { return me; }
export function isCoordinador() { return me && me.rol === 'coordinador'; }

const COMPANY = {
  nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
  direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
  fonos: ['569 89798503', '569 99967675'],
  email: 'Soporte@wifired.cl',
  autoriza: 'Martin Ballesteros Escarate',
};

let state = { visitas: [], tecnicos: [], config: { bloques: [], tipos: [], estados: [] } };
const listeners = new Set();

// ---------- API helper ----------
async function api(method, url, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  const tk = getToken();
  if (tk) opt.headers.Authorization = 'Bearer ' + tk;
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch('/api' + url, opt);
  if (res.status === 401) { logout(); throw new Error('Sesión expirada'); }
  if (!res.ok) {
    let msg = 'Error de servidor';
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export async function initStore() {
  const data = await api('GET', '/bootstrap');
  state.visitas = data.visitas;
  state.tecnicos = data.tecnicos;
  state.config = data.config;
  me = data.me || null;
  return state;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(state)); }

// ---------- Getters ----------
export function getState() { return state; }
export const company = COMPANY;
export function visitas() { return state.visitas; }
export function byUid(uid) { return state.visitas.find((v) => v._uid === uid); }
export function tecnicosList() { return state.tecnicos; }
/** Nombres de visualización de técnicos ACTIVOS (para selects) */
export function tecnicos() { return state.tecnicos.filter((t) => t.activo).map((t) => t.display); }
export function tipos() { return state.config.tipos; }
export function bloques() { return state.config.bloques; }
export function estados() { return state.config.estados; }

// ---------- Visitas ----------
export async function updateVisita(uid, patch) {
  const idx = state.visitas.findIndex((v) => v._uid === uid);
  if (idx < 0) return;
  const prev = state.visitas[idx];
  state.visitas[idx] = { ...prev, ...patch }; // optimista
  emit();
  try {
    const updated = await api('PUT', '/visitas/' + uid, patch);
    state.visitas[idx] = updated; emit();
  } catch (e) {
    state.visitas[idx] = prev; emit();
    toast(e.message, 'info');
  }
}

export async function addVisita(data) {
  try {
    const v = await api('POST', '/visitas', data);
    state.visitas.unshift(v); emit();
    return v;
  } catch (e) { toast(e.message, 'info'); throw e; }
}

export async function deleteVisita(uid) {
  const prev = state.visitas.slice();
  state.visitas = state.visitas.filter((v) => v._uid !== uid); emit();
  try { await api('DELETE', '/visitas/' + uid); }
  catch (e) { state.visitas = prev; emit(); toast(e.message, 'info'); }
}

// ---------- Técnicos ----------
export async function addTecnico(data) {
  try {
    const t = await api('POST', '/tecnicos', data);
    state.tecnicos.push(t); emit();
    return t;
  } catch (e) { toast(e.message, 'info'); throw e; }
}

export async function updateTecnico(id, patch) {
  const idx = state.tecnicos.findIndex((t) => t.id == id);
  if (idx < 0) return;
  try {
    const t = await api('PUT', '/tecnicos/' + id, patch);
    state.tecnicos[idx] = t; emit();
    return t;
  } catch (e) { toast(e.message, 'info'); throw e; }
}

export async function deleteTecnico(id) {
  const prev = state.tecnicos.slice();
  state.tecnicos = state.tecnicos.filter((t) => t.id != id); emit();
  try { await api('DELETE', '/tecnicos/' + id); }
  catch (e) { state.tecnicos = prev; emit(); toast(e.message, 'info'); }
}
