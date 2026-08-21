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

/**
 * Enlace a Google Maps a partir de una dirección.
 * - Si son coordenadas ("lat,lng"): enlaza directo al punto (NO agrega ciudad, o las rompe).
 * - Si es un enlace (http…): lo usa tal cual.
 * - Si es texto: busca la dirección agregando la comuna para ubicarla mejor.
 */
export function mapsHref(dir) {
  const s = String(dir || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const c = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (c) return `https://www.google.com/maps?q=${c[1]},${c[2]}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s + ', Melipilla, Chile')}`;
}

// ============================================================
// Validación de datos (Chile): RUT, teléfono y correo
// ============================================================

/** Deja solo dígitos y la K del RUT, en mayúscula */
export function limpiaRut(r) { return (r || '').replace(/[^0-9kK]/g, '').toUpperCase(); }

/** Valida un RUT chileno con dígito verificador (módulo 11) */
export function validaRut(r) {
  const s = limpiaRut(r);
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (suma % 11);
  const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res);
  return dv === dvCalc;
}

/** Formatea un RUT como 12.345.678-9 */
export function formatRut(r) {
  const s = limpiaRut(r);
  if (s.length < 2) return s;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}

/** Valida un teléfono chileno (9 dígitos: móvil 9xxxxxxxx o fijo con código de área) */
export function validaFono(f) {
  let d = (f || '').replace(/\D/g, '');
  if (d.startsWith('56')) d = d.slice(2);
  return d.length === 9;
}

/** Formatea un teléfono chileno como 9 1234 5678 */
export function formatFono(f) {
  let d = (f || '').replace(/\D/g, '');
  if (d.startsWith('56') && d.length > 9) d = d.slice(2);
  if (d.length === 9) return `${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`;
  return (f || '').trim();
}

/** Valida un correo electrónico */
export function validaEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim()); }

/**
 * Enlaza validación en vivo a un <input>.
 * Marca el campo como inválido (integra con form.reportValidity) y formatea al salir.
 * @param {HTMLInputElement} input
 * @param {{validate:(v:string)=>boolean, format?:(v:string)=>string, msg?:string, required?:boolean}} opt
 */
export function bindField(input, { validate, format, msg = 'Dato inválido', required = false, okMsg = '' } = {}) {
  if (!input) return;
  // Mensaje en vivo justo debajo del campo (rojo si es inválido, verde si es válido)
  let hint = input.parentNode && input.parentNode.querySelector(':scope > .field-hint');
  if (!hint && input.parentNode) {
    hint = document.createElement('div');
    hint.className = 'field-hint';
    hint.style.display = 'none';
    input.insertAdjacentElement('afterend', hint);
  }
  const setHint = (state, text) => {
    if (!hint) return;
    hint.textContent = text || '';
    hint.className = 'field-hint' + (state ? ' ' + state : '');
    hint.style.display = text ? '' : 'none';
  };
  const run = () => {
    const val = input.value.trim();
    if (!val) {
      input.setCustomValidity(required ? (msg || 'Campo obligatorio') : '');
      input.classList.remove('input-bad', 'input-ok');
      setHint('', ''); return;
    }
    const ok = validate ? validate(val) : true;
    input.setCustomValidity(ok ? '' : msg);
    input.classList.toggle('input-bad', !ok);
    input.classList.toggle('input-ok', ok);
    setHint(ok ? 'ok' : 'bad', ok ? okMsg : msg);
  };
  input.addEventListener('input', run);
  input.addEventListener('blur', () => {
    if (format && input.value.trim()) input.value = format(input.value);
    run();
  });
  run();
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
