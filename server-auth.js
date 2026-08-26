// ============================================================
// WIFIRED · Utilidades de autenticación (sin dependencias)
// Hash de contraseñas (scrypt) + tokens firmados (HMAC-SHA256)
// ============================================================
const crypto = require('crypto');

// Secreto para firmar los tokens de sesión. DEBE venir de la variable de entorno
// AUTH_SECRET en producción. Si no está (o es muy corto), generamos uno aleatorio
// al arrancar: seguro, pero las sesiones se cierran en cada reinicio del servidor.
let SECRET = process.env.AUTH_SECRET;
if (!SECRET || SECRET.length < 16) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('\n⚠️  AUTH_SECRET no definido (o demasiado corto). Se generó uno temporal.');
  console.warn('   Las sesiones se cerrarán en cada reinicio. Define AUTH_SECRET (32+ caracteres) en las variables de entorno para producción.\n');
}
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${h}`;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const hh = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  const a = Buffer.from(h, 'hex'), b = Buffer.from(hh, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
  if (!p.exp || Date.now() > p.exp) return null;
  return p;
}

function slug(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

/** Usuario memorable: nombre.apellido (primer y último token) */
function slugUser(nombre) {
  const toks = (nombre || '').trim().split(/\s+/).map(slug).filter(Boolean);
  if (toks.length >= 2) return `${toks[0]}.${toks[toks.length - 1]}`;
  return toks[0] || 'tecnico';
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, slugUser };
