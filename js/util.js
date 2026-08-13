// ============================================================
// WIFIRED · Utilidades comunes
// ============================================================

/** Escapa HTML para insertar texto de forma segura */
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Crea un elemento desde HTML string */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** '2026-07-01' -> Date local (sin desfase de zona) */
export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function fmtDate(iso, long = false) {
  const dt = parseDate(iso);
  if (!dt) return '—';
  if (long) return `${DIAS[dt.getDay()]}, ${dt.getDate()} de ${MESES_L[dt.getMonth()]} ${dt.getFullYear()}`;
  return `${dt.getDate()} ${MESES[dt.getMonth()]} ${dt.getFullYear()}`;
}
export function fmtDateShort(iso) {
  const dt = parseDate(iso);
  if (!dt) return '—';
  return `${DIAS[dt.getDay()].slice(0, 3)} ${dt.getDate()} ${MESES[dt.getMonth()]}`;
}
export function todayISO() { return toISO(new Date()); }
export function addDays(iso, n) {
  const dt = parseDate(iso) || new Date();
  dt.setDate(dt.getDate() + n);
  return toISO(dt);
}

/** Deriva rol + nombre corto de "Técnico Angel Eduardo Pavez Aliaga" */
const ROLES = ['Técnico', 'Ingeniero', 'Soporte de Emergencia', 'Soporte', 'Planta Externa'];
export function parseTecnico(full) {
  if (!full) return { role: 'Sin asignar', name: 'Sin asignar', short: 'Sin asignar', initials: '?', color: '#94a3b8' };
  let role = '', rest = full;
  for (const r of ROLES) {
    if (full.startsWith(r)) { role = r; rest = full.slice(r.length).trim(); break; }
  }
  if (!rest) { rest = full; }
  const parts = rest.split(/\s+/).filter(Boolean);
  const short = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : rest;
  const initials = (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
  return { role: role || '—', name: rest, short, initials: initials.toUpperCase() || '?', color: colorFor(full) };
}

/** Color determinístico a partir de un string */
const PALETTE = ['#2563eb', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#6366f1', '#f97316'];
export function colorFor(str) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
export function initials(name) {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

export const PRIORIDADES = ['Alta', 'Media', 'Baja'];
/** Rango para ordenar: Alta primero */
export function prioRank(p) { return p === 'Alta' ? 0 : p === 'Baja' ? 2 : 1; }

/** Normaliza un teléfono chileno a formato internacional para tel:/WhatsApp */
export function normalizaFono(phone) {
  let d = (phone || '').split(/[/,]/)[0].replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('56')) return d;
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.length === 8) return '569' + d;
  return d.length >= 8 ? '56' + d : '';
}
export function telLink(phone) { const n = normalizaFono(phone); return n ? 'tel:+' + n : ''; }
export function waLink(phone, msg) {
  const n = normalizaFono(phone);
  return n ? `https://wa.me/${n}${msg ? '?text=' + encodeURIComponent(msg) : ''}` : '';
}

export function debounce(fn, ms = 220) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Etiqueta corta de bloque horario */
export function bloqueShort(b) {
  if (!b) return '—';
  if (b.startsWith('AM')) return 'AM';
  if (b.startsWith('PM')) return 'PM';
  if (b.startsWith('Sábado')) return 'Sáb AM';
  if (b.startsWith('Dentro')) return 'Todo el día';
  return b;
}

export function toast(msg, type = 'ok') {
  const root = document.getElementById('toast-root');
  const el = h(`<div class="toast ${type}"><span>✓</span><span>${esc(msg)}</span></div>`);
  if (type === 'info') el.querySelector('span').textContent = 'ℹ';
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 2400);
  setTimeout(() => el.remove(), 2750);
}
