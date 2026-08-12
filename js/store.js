// ============================================================
// WIFIRED · Store — estado + persistencia en localStorage
// ============================================================
import { SEED } from '../data/seed.js';

const LS_KEY = 'wifired_agenda_v1';

const COMPANY = {
  nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
  direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
  fonos: ['569 89798503', '569 99967675'],
  email: 'Soporte@wifired.cl',
  autoriza: 'Martin Ballesteros Escarate',
};

let state = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  // primera carga: sembrar desde el Excel
  const seeded = {
    visitas: SEED.visitas.map((v, i) => ({ _uid: 'v' + (i + 1), ...v })),
    bloques: SEED.bloques,
    tipos: SEED.tipos,
    estados: SEED.estados,
    tecnicos: SEED.tecnicos,
  };
  return seeded;
}

export function initStore() {
  state = load();
  persist();
  return state;
}

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* full */ }
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { persist(); listeners.forEach((fn) => fn(state)); }

// ---------- Getters ----------
export function getState() { return state; }
export const company = COMPANY;
export function visitas() { return state.visitas; }
export function byUid(uid) { return state.visitas.find((v) => v._uid === uid); }
export function tecnicos() { return state.tecnicos; }
export function tipos() { return state.tipos; }
export function bloques() { return state.bloques; }
export function estados() { return state.estados; }

// ---------- Mutations ----------
export function updateVisita(uid, patch) {
  const v = byUid(uid);
  if (!v) return;
  Object.assign(v, patch);
  emit();
}

export function addVisita(data) {
  const uid = 'v' + (Date.now());
  const nums = state.visitas
    .map((v) => parseInt((v.id.match(/(\d+)\s*$/) || [])[1] || '0', 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const id = `OT-MEL-2026-${String(next).padStart(3, '0')}`;
  const v = { _uid: uid, id, gps: '', ...data };
  state.visitas.unshift(v);
  emit();
  return v;
}

export function deleteVisita(uid) {
  state.visitas = state.visitas.filter((v) => v._uid !== uid);
  emit();
}

/** Reinicia a los datos originales del Excel */
export function resetSeed() {
  localStorage.removeItem(LS_KEY);
  state = load();
  emit();
}
