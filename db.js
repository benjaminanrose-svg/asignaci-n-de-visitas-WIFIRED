// ============================================================
// WIFIRED · Capa de datos
// Usa PostgreSQL si existe DATABASE_URL; si no, un store en
// memoria (sembrado) para desarrollo/demo local sin base de datos.
// Interfaz única y asíncrona para ambos modos.
// ============================================================
const fs = require('fs');
const path = require('path');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed.json'), 'utf8'));

// Configuración por defecto (semilla). La coordinación puede editarla desde
// el panel; los cambios se guardan en la tabla settings (clave 'config') y se
// fusionan sobre estos valores base.
const DEFAULT_CONFIG = {
  bloques: SEED.bloques,
  tipos: SEED.tipos,
  estados: SEED.estados,
  prioridades: ['Alta', 'Media', 'Baja'],
  nodos: [],
  empresa: {
    nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
    direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
    fonos: ['569 89798503', '569 99967675'],
    email: 'Soporte@wifired.cl',
    autoriza: 'Martin Ballesteros Escarate',
  },
};
const CONFIG = DEFAULT_CONFIG; // compat

// Configuración por defecto del bot de WhatsApp (editable desde la app).
const DEFAULT_BOT = {
  activo: true,
  modo_prueba: true,
  palabra_prueba: 'paralelepipedo',
  saludo: 'Soy el asistente virtual. ¿En qué te ayudo hoy?',
  planes: '📶 *Planes de Internet WIFIRED* 🚀\n\n*Solo Internet* (router Wi-Fi 6 doble banda, equipos en comodato):\n• *Básico* — 400 Mbps → $13.990/mes\n• *Medio* — 650 Mbps → $19.990/mes\n• *Full* — 940 Mbps → $29.990/mes\n\n*Internet + Televisión* 📺:\n• *Dúo Básico* — 400 Mbps → $21.990/mes\n• *Dúo Medio* — 650 Mbps → $27.990/mes\n• *Dúo Full* — 940 Mbps → $35.990/mes\n\n✅ Velocidad garantizada · Wi-Fi 6 · Equipos en comodato\n🎁 Los planes *Full* incluyen extensor ZTE AC 1200 sin costo (si se necesita).\n\n¿Cuál te interesa? Respóndeme con el *nombre del plan* (ej: *Full* o *Dúo Medio*) y un ejecutivo coordina tu instalación. 🙌',
  horario: {
    activo: false,
    desde: '09:00',
    hasta: '19:00',
    mensaje: 'En este momento estamos fuera de nuestro horario de atención, pero igual registramos tu solicitud y te respondemos apenas volvamos. 🙌',
  },
  confirma_visita: {
    activo: false,
    hora: 18,
    mensaje: 'Hola {nombre} 👋 Le recordamos su *visita técnica de WIFIRED* para *mañana* ({fecha}), en el bloque {bloque}.\n\n¿Confirma la visita? Responda *SÍ* para confirmarla o *NO* para cancelarla. 🙌',
  },
  // Términos y condiciones que el bot envía al cliente durante la contratación (se editan en la página).
  condiciones: '',
};
/** Fusiona la config del bot guardada sobre los valores por defecto */
function mergeBot(b) {
  const s = b && typeof b === 'object' ? b : {};
  const h = s.horario && typeof s.horario === 'object' ? s.horario : {};
  return {
    activo: s.activo !== false,
    modo_prueba: s.modo_prueba !== false,
    palabra_prueba: typeof s.palabra_prueba === 'string' && s.palabra_prueba.trim() ? s.palabra_prueba.trim() : DEFAULT_BOT.palabra_prueba,
    saludo: typeof s.saludo === 'string' && s.saludo.trim() ? s.saludo : DEFAULT_BOT.saludo,
    planes: typeof s.planes === 'string' && s.planes.trim() ? s.planes : DEFAULT_BOT.planes,
    horario: {
      activo: !!h.activo,
      desde: h.desde || DEFAULT_BOT.horario.desde,
      hasta: h.hasta || DEFAULT_BOT.horario.hasta,
      mensaje: typeof h.mensaje === 'string' && h.mensaje.trim() ? h.mensaje : DEFAULT_BOT.horario.mensaje,
    },
    confirma_visita: (() => {
      const cv = s.confirma_visita && typeof s.confirma_visita === 'object' ? s.confirma_visita : {};
      const hora = parseInt(cv.hora, 10);
      return {
        activo: !!cv.activo,
        hora: Number.isFinite(hora) && hora >= 0 && hora <= 23 ? hora : DEFAULT_BOT.confirma_visita.hora,
        mensaje: typeof cv.mensaje === 'string' && cv.mensaje.trim() ? cv.mensaje : DEFAULT_BOT.confirma_visita.mensaje,
      };
    })(),
    condiciones: typeof s.condiciones === 'string' ? s.condiciones : '',
    // Flujo del menú editable desde la página (menú → opciones → pasos). Si no hay, el bot usa su flujo por defecto.
    flujo: sanitizeFlujo(s.flujo),
  };
}
/** Valida/limpia el flujo editable del menú del bot. Devuelve null si no es válido (el bot usará el por defecto). */
function sanitizeFlujo(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.opciones)) return null;
  const TIPOS = ['texto', 'ubicacion', 'telefono', 'correo', 'rut', 'foto'];
  const str = (x) => (typeof x === 'string' ? x : '');
  const opciones = f.opciones.map((op) => {
    op = op && typeof op === 'object' ? op : {};
    const pasos = (Array.isArray(op.pasos) ? op.pasos : []).map((p) => {
      p = p && typeof p === 'object' ? p : {};
      return {
        campo: str(p.campo).trim() || 'campo',
        tipo: TIPOS.includes(p.tipo) ? p.tipo : 'texto',
        pregunta: str(p.pregunta),
      };
    }).filter((p) => p.pregunta.trim());
    return {
      n: str(op.n).trim() || '',
      titulo: str(op.titulo).trim(),
      desc: str(op.desc),
      categoria: str(op.categoria).trim() || str(op.titulo).trim() || 'Consulta',
      confirma: str(op.confirma),
      pasos,
    };
  }).filter((op) => op.n && op.titulo && op.pasos.length);
  if (!opciones.length) return null;
  return { intro: str(f.intro), opciones };
}
/** Fusiona la config guardada (settings.config) sobre los valores por defecto */
async function loadConfig(getSetting) {
  let stored = {};
  try { const raw = await getSetting('config'); if (raw) stored = JSON.parse(raw) || {}; } catch (e) {}
  const arr = (v, d) => (Array.isArray(v) && v.length ? v.map((x) => String(x).trim()).filter(Boolean) : d);
  return {
    bloques: arr(stored.bloques, DEFAULT_CONFIG.bloques),
    tipos: arr(stored.tipos, DEFAULT_CONFIG.tipos),
    estados: arr(stored.estados, DEFAULT_CONFIG.estados),
    prioridades: arr(stored.prioridades, DEFAULT_CONFIG.prioridades),
    nodos: arr(stored.nodos, DEFAULT_CONFIG.nodos),
    empresa: { ...DEFAULT_CONFIG.empresa, ...(stored.empresa && typeof stored.empresa === 'object' ? stored.empresa : {}) },
    // Avisos automáticos por correo al cliente (agendada + recordatorio). Encendidos por defecto.
    avisos_cliente: stored.avisos_cliente !== false,
    // Configuración del bot de WhatsApp (textos, planes, horario).
    bot: mergeBot(stored.bot),
  };
}
/** Guarda un parche de configuración (fusiona sobre lo actual) */
async function saveConfigWith(getSetting, setSetting, patch) {
  const cur = await loadConfig(getSetting);
  const next = { ...cur, ...(patch || {}) };
  if (patch && patch.empresa) next.empresa = { ...cur.empresa, ...patch.empresa };
  if (patch && patch.bot) {
    next.bot = { ...cur.bot, ...patch.bot };
    if (patch.bot.horario) next.bot.horario = { ...cur.bot.horario, ...patch.bot.horario };
  }
  await setSetting('config', JSON.stringify(next));
  return next;
}

const ROLES = ['Técnico', 'Ingeniero', 'Soporte de Emergencia', 'Soporte', 'Planta Externa'];

/** Divide "Técnico Angel Eduardo Pavez Aliaga" -> {rol, nombre} */
function splitTecnico(full) {
  const s = (full || '').trim();
  for (const r of ROLES) {
    if (s.startsWith(r)) return { rol: r, nombre: s.slice(r.length).trim() };
  }
  return { rol: 'Técnico', nombre: s };
}
/** Recompone el string de visualización (compatible con datos existentes) */
function displayTecnico(rol, nombre) {
  return (nombre ? `${rol} ${nombre}` : rol).trim();
}

function nextOt(existing, tipo) {
  const facti = String(tipo || '').trim().toLowerCase() === 'factibilidad';
  const prefix = facti ? 'OT-FAC-2026-' : 'OT-MEL-2026-';
  const nums = existing
    .filter((ot) => (facti ? String(ot).startsWith('OT-FAC-') : !String(ot).startsWith('OT-FAC-')))
    .map((ot) => parseInt((String(ot).match(/(\d+)\s*$/) || [])[1] || '0', 10))
    .filter((n) => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

const VISIT_FIELDS = ['estado', 'tipo', 'fecha', 'bloque', 'cliente', 'rut', 'telefono', 'direccion', 'gps', 'detalle', 'tecnico', 'asignado_por', 'reagenda_solicitada', 'reagenda_motivo', 'prioridad', 'evidencias', 'email', 'firma_cliente', 'firma_tecnico', 'orden_enviada', 'nodo', 'historial', 'validada', 'aviso_agendada', 'recordatorio_enviado', 'confirmacion', 'confirmacion_enviada'];

// Campos de un ticket de atención (WhatsApp / manual). Se clasifican por
// categoría y estado; 'factibilidad' aplica a los de contratación.
const TICKET_FIELDS = ['categoria', 'estado', 'factibilidad', 'nombre', 'telefono', 'direccion', 'ubicacion', 'mensaje', 'canal', 'notas', 'historial', 'rut', 'email', 'adjuntos'];
// Servicios = perfil del cliente atado a su cuenta PPPoE del router (para cortar/activar internet)
const SERVICE_FIELDS = ['nombre', 'rut', 'telefono', 'direccion', 'email', 'plan', 'pppoe_user', 'estado', 'notas', 'gps', 'mikrowisp_id', 'nodo', 'ip', 'dia_pago'];
/** Normaliza el historial (arreglo o texto) a JSON en texto para guardar */
function evStr(v) { return Array.isArray(v) ? JSON.stringify(v) : (v || '[]'); }

/** evidencias / historial se guardan como JSON (texto) y se exponen como arreglo */
function parseEv(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

/** Hash corto (determinístico) para detectar cambios sin transferir toda la data */
function revHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
/** Firma corta a partir de campos ligeros de una visita (sin base64) */
function visitSigPart(v) {
  const len = (x) => (x == null ? 0 : String(x).length);
  return [v.id, v.estado, v.tecnico, v.fecha, v.prioridad, v.reagenda_solicitada ? 1 : 0,
    v.validada, len(v.detalle), len(v.evidencias), len(v.historial),
    v.firma_cliente ? 1 : 0, v.firma_tecnico ? 1 : 0].join('~');
}

const { hashPassword, slugUser } = require('./server-auth.js');
const ADMIN_USER = process.env.ADMIN_USER || 'coordinacion';
const ADMIN_PASS = process.env.ADMIN_PASS || 'wifired2026';
const TECH_PASS = process.env.TECH_PASS || 'wifired';

/** Genera usuarios semilla: 1 coordinador + 1 por técnico */
function seedUsers(tecnicos) {
  const users = [{ id: 1, username: ADMIN_USER, pass: hashPassword(ADMIN_PASS), pass_plain: ADMIN_PASS, rol: 'coordinador', nombre: 'Coordinación', tecnico_id: null }];
  const taken = new Set([ADMIN_USER]);
  let seq = 1;
  tecnicos.forEach((t) => {
    let u = slugUser(t.nombre || t.rol); let base = u, i = 2;
    while (taken.has(u)) u = `${base}${i++}`;
    taken.add(u);
    users.push({ id: ++seq, username: u, pass: hashPassword(TECH_PASS), pass_plain: TECH_PASS, rol: 'tecnico', nombre: displayTecnico(t.rol, t.nombre), tecnico_id: t.id });
  });
  return users;
}

// ============================================================
//  Store en memoria
// ============================================================
function memoryStore() {
  let tecnicos = []; // se empieza desde 0: la coordinación crea los técnicos
  let tSeq = 0;
  let visitas = SEED.visitas.map((v, i) => ({ id: i + 1, ot: v.id, ...pick(v) }));
  let vSeq = visitas.length;
  let tickets = []; // se empieza desde 0
  let kSeq = 0;
  let outbox = []; // mensajes automáticos que el bot debe enviar por WhatsApp
  let oSeq = 0;
  let servicios = []; // perfiles de cliente con cuenta PPPoE
  let sSeq = 0;

  function pick(v) {
    const o = {};
    VISIT_FIELDS.forEach((f) => (o[f] = v[f] || ''));
    return o;
  }
  let users = seedUsers(tecnicos);
  let uSeq = users.length;
  const settings = {};
  let pushSubs = []; // { userId, endpoint, sub }
  const credsOf = (tid) => { const u = users.find((x) => x.tecnico_id == tid); return { username: u ? u.username : '', password: u ? (u.pass_plain || '') : '' }; };
  const outT = (t) => ({ ...t, display: displayTecnico(t.rol, t.nombre), ...credsOf(t.id) });
  const outV = (v) => { const o = { _uid: String(v.id), id: v.ot, ...pick(v) }; o.prioridad = o.prioridad || 'Media'; o.evidencias = parseEv(o.evidencias); o.historial = parseEv(o.historial); return o; };
  const pickTk = (d) => { const o = {}; TICKET_FIELDS.forEach((f) => (o[f] = d[f] || '')); o.historial = evStr(d.historial); o.adjuntos = evStr(d.adjuntos); return o; };
  const outTk = (t) => { const o = { _uid: String(t.id), num: 'T-' + String(t.id).padStart(4, '0'), created_at: t.created_at, updated_at: t.updated_at, ...pickTk(t) }; o.estado = o.estado || 'Nuevo'; o.categoria = o.categoria || 'Otros'; o.canal = o.canal || 'manual'; o.historial = parseEv(o.historial); o.adjuntos = parseEv(o.adjuntos); return o; };
  const uniqUser = (base, exceptId) => { let u = base || 'tecnico', b = u, i = 2; while (users.some((x) => x.username === u && x.id !== exceptId)) u = `${b}${i++}`; return u; };
  const pickS = (d) => { const o = {}; SERVICE_FIELDS.forEach((f) => (o[f] = d[f] || '')); return o; };
  const outS = (s) => ({ _uid: String(s.id), ...pickS(s), estado: s.estado || 'activo', created_at: s.created_at, updated_at: s.updated_at });

  return {
    async init() {},
    async getConfig() { return loadConfig(async (k) => settings[k] ?? null); },
    async saveConfig(patch) { return saveConfigWith(async (k) => settings[k] ?? null, async (k, v) => { settings[k] = v; }, patch); },
    async getUserByUsername(u) { return users.find((x) => x.username === u) || null; },
    async getUserById(id) { return users.find((x) => x.id == id) || null; },
    async getTecnicoById(id) { const t = tecnicos.find((x) => x.id == id); return t ? outT(t) : null; },
    async listTecnicos() { return tecnicos.map(outT); },
    async addTecnico(d) {
      const t = { id: ++tSeq, rol: d.rol || 'Técnico', nombre: (d.nombre || '').trim(), telefono: d.telefono || '', activo: d.activo !== false };
      tecnicos.push(t);
      const username = uniqUser((d.username || '').trim().toLowerCase() || slugUser(t.nombre || t.rol));
      const pass_plain = (d.password || '').trim() || TECH_PASS;
      users.push({ id: ++uSeq, username, pass: hashPassword(pass_plain), pass_plain, rol: 'tecnico', nombre: displayTecnico(t.rol, t.nombre), tecnico_id: t.id });
      return outT(t);
    },
    async updateTecnico(id, patch) {
      const t = tecnicos.find((x) => x.id == id); if (!t) return null;
      ['rol', 'nombre', 'telefono', 'activo'].forEach((k) => { if (k in patch) t[k] = patch[k]; });
      const u = users.find((x) => x.tecnico_id == id);
      if (u) {
        u.nombre = displayTecnico(t.rol, t.nombre);
        if (patch.username != null && patch.username.trim()) u.username = uniqUser(patch.username.trim().toLowerCase(), u.id);
        if (patch.password != null && patch.password.trim()) { u.pass_plain = patch.password.trim(); u.pass = hashPassword(u.pass_plain); }
      }
      return outT(t);
    },
    async deleteTecnico(id) { tecnicos = tecnicos.filter((x) => x.id != id); },
    async listVisitas() { return visitas.map(outV); },
    async revSignature(forTecnico) {
      const list = forTecnico ? visitas.filter((v) => v.tecnico === forTecnico) : visitas;
      let sig = revHash(list.length + '|' + list.map(visitSigPart).join('|'));
      if (!forTecnico) sig += '.' + revHash(tickets.length + '|' + tickets.map((t) => [t.id, t.estado, t.factibilidad, t.categoria, t.updated_at || ''].join('~')).join('|'));
      return sig;
    },
    async addVisita(d) {
      const ot = nextOt(visitas.map((x) => x.ot), d.tipo);
      const v = { id: ++vSeq, ot, ...pick(d) };
      if (!v.estado) v.estado = 'Pendiente';
      visitas.unshift(v); return outV(v);
    },
    async updateVisita(id, patch) {
      const v = visitas.find((x) => x.id == id); if (!v) return null;
      VISIT_FIELDS.forEach((k) => { if (k in patch) v[k] = patch[k]; });
      if ('ot' in patch && String(patch.ot || '').trim()) v.ot = String(patch.ot).trim();
      return outV(v);
    },
    async deleteVisita(id) { visitas = visitas.filter((x) => x.id != id); },
    async deleteAllVisitas() { const n = visitas.length; visitas = []; return n; },
    async listTickets() { return tickets.slice().sort((a, b) => b.id - a.id).map(outTk); },
    async addTicket(d) {
      const now = new Date().toISOString();
      const t = { id: ++kSeq, created_at: now, updated_at: now, ...pickTk(d) };
      if (!t.estado) t.estado = 'Nuevo';
      tickets.push(t);
      return outTk(t);
    },
    async updateTicket(id, patch) {
      const t = tickets.find((x) => x.id == id); if (!t) return null;
      TICKET_FIELDS.forEach((k) => { if (k in patch) t[k] = (k === 'historial' || k === 'adjuntos') ? evStr(patch[k]) : patch[k]; });
      t.updated_at = new Date().toISOString();
      return outTk(t);
    },
    async deleteTicket(id) { tickets = tickets.filter((x) => x.id != id); },
    async addOutbox(telefono, texto, tipo) {
      const o = { id: ++oSeq, telefono: telefono || '', texto: texto || '', tipo: tipo || '', estado: 'pendiente', created_at: new Date().toISOString(), sent_at: null };
      outbox.push(o); return o;
    },
    async listOutboxPending() { return outbox.filter((o) => o.estado === 'pendiente').map((o) => ({ ...o })); },
    async markOutboxSent(id) { const o = outbox.find((x) => x.id == id); if (o) { o.estado = 'enviado'; o.sent_at = new Date().toISOString(); } },
    async setPin(id, pin) { const v = visitas.find((x) => x.id == id); if (v) { v.pin = pin; v.pin_ts = pin ? Date.now() : 0; } },
    async getPin(id) { const v = visitas.find((x) => x.id == id); return v ? { pin: v.pin || '', ts: v.pin_ts || 0 } : { pin: '', ts: 0 }; },
    async listServicios() { return servicios.slice().sort((a, b) => b.id - a.id).map(outS); },
    async getServicio(id) { const s = servicios.find((x) => x.id == id); return s ? outS(s) : null; },
    async addServicio(d) {
      const now = new Date().toISOString();
      const s = { id: ++sSeq, created_at: now, updated_at: now, ...pickS(d) };
      if (!s.estado) s.estado = 'activo';
      servicios.push(s); return outS(s);
    },
    async updateServicio(id, patch) {
      const s = servicios.find((x) => x.id == id); if (!s) return null;
      SERVICE_FIELDS.forEach((k) => { if (k in patch) s[k] = patch[k]; });
      s.updated_at = new Date().toISOString(); return outS(s);
    },
    async deleteServicio(id) { servicios = servicios.filter((x) => x.id != id); },
    async getSetting(k) { return settings[k] ?? null; },
    async setSetting(k, v) { settings[k] = v; },
    async savePushSub(userId, sub) { pushSubs = pushSubs.filter((s) => s.endpoint !== sub.endpoint); pushSubs.push({ userId, endpoint: sub.endpoint, sub }); },
    async listPushSubsByTecnicoId(tid) { const u = users.find((x) => x.tecnico_id == tid); return u ? pushSubs.filter((s) => s.userId === u.id).map((s) => s.sub) : []; },
    async removePushSubByEndpoint(ep) { pushSubs = pushSubs.filter((s) => s.endpoint !== ep); },
  };
}

// ============================================================
//  Store PostgreSQL
// ============================================================
// ¿La conexión necesita SSL? Las bases internas (Railway interno, Coolify u
// otro servidor propio, IP privada, localhost) NO usan SSL; las bases públicas
// remotas sí. Se puede forzar con DATABASE_SSL=true / DATABASE_SSL=false.
function needsSsl(url) {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return false; }
  if (/^(localhost|127\.0\.0\.1|::1)$/.test(host)) return false;
  if (host === 'railway.internal' || host.endsWith('.railway.internal')) return false;
  if (!host.includes('.')) return false; // nombre de servicio Docker (Coolify, etc.)
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; // IP privada
  return true;
}

function pgStore(url) {
  const { Pool } = require('pg');
  const ssl = needsSsl(url) ? { rejectUnauthorized: false } : false;
  const pool = new Pool({ connectionString: url, ssl });

  const outT = (r) => ({ id: r.id, rol: r.rol, nombre: r.nombre, telefono: r.telefono || '', activo: r.activo, display: displayTecnico(r.rol, r.nombre) });
  const outV = (r) => ({
    _uid: String(r.id), id: r.ot,
    estado: r.estado || '', tipo: r.tipo || '', fecha: r.fecha || '', bloque: r.bloque || '',
    cliente: r.cliente || '', rut: r.rut || '', telefono: r.telefono || '', direccion: r.direccion || '',
    gps: r.gps || '', detalle: r.detalle || '', tecnico: r.tecnico || '', asignado_por: r.asignado_por || '',
    reagenda_solicitada: r.reagenda_solicitada || '', reagenda_motivo: r.reagenda_motivo || '',
    prioridad: r.prioridad || 'Media', evidencias: parseEv(r.evidencias),
    email: r.email || '', firma_cliente: r.firma_cliente || '', firma_tecnico: r.firma_tecnico || '', orden_enviada: r.orden_enviada || '',
    nodo: r.nodo || '', historial: parseEv(r.historial), validada: r.validada || '',
    aviso_agendada: r.aviso_agendada || '', recordatorio_enviado: r.recordatorio_enviado || '',
    confirmacion: r.confirmacion || '', confirmacion_enviada: r.confirmacion_enviada || '',
  });
  const outU = (r) => r ? { id: r.id, username: r.username, pass: r.pass, rol: r.rol, nombre: r.nombre, tecnico_id: r.tecnico_id } : null;
  const outTk = (r) => ({
    _uid: String(r.id), num: 'T-' + String(r.id).padStart(4, '0'),
    created_at: r.created_at, updated_at: r.updated_at,
    categoria: r.categoria || 'Otros', estado: r.estado || 'Nuevo', factibilidad: r.factibilidad || '',
    nombre: r.nombre || '', telefono: r.telefono || '', direccion: r.direccion || '',
    ubicacion: r.ubicacion || '', mensaje: r.mensaje || '', canal: r.canal || 'manual',
    notas: r.notas || '', historial: parseEv(r.historial),
    rut: r.rut || '', email: r.email || '', adjuntos: parseEv(r.adjuntos),
  });
  const outS = (r) => ({
    _uid: String(r.id), nombre: r.nombre || '', rut: r.rut || '', telefono: r.telefono || '', direccion: r.direccion || '',
    email: r.email || '', plan: r.plan || '', pppoe_user: r.pppoe_user || '', estado: r.estado || 'activo',
    notas: r.notas || '', gps: r.gps || '', mikrowisp_id: r.mikrowisp_id || '', nodo: r.nodo || '', ip: r.ip || '', dia_pago: r.dia_pago || '',
    created_at: r.created_at, updated_at: r.updated_at,
  });
  async function credsOf(tid) {
    const { rows } = await pool.query('SELECT username, pass_plain FROM usuarios WHERE tecnico_id=$1', [tid]);
    return rows[0] ? { username: rows[0].username, password: rows[0].pass_plain || '' } : { username: '', password: '' };
  }
  async function enrich(t) { return { ...outT(t), ...(await credsOf(t.id)) }; }

  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tecnicos (
          id SERIAL PRIMARY KEY,
          rol TEXT NOT NULL DEFAULT 'Técnico',
          nombre TEXT NOT NULL DEFAULT '',
          telefono TEXT DEFAULT '',
          activo BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT now()
        );`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitas (
          id SERIAL PRIMARY KEY,
          ot TEXT UNIQUE NOT NULL,
          estado TEXT DEFAULT 'Pendiente',
          tipo TEXT DEFAULT '',
          fecha TEXT DEFAULT '',
          bloque TEXT DEFAULT '',
          cliente TEXT DEFAULT '',
          rut TEXT DEFAULT '',
          telefono TEXT DEFAULT '',
          direccion TEXT DEFAULT '',
          gps TEXT DEFAULT '',
          detalle TEXT DEFAULT '',
          tecnico TEXT DEFAULT '',
          asignado_por TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS asignado_por TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS reagenda_solicitada TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS reagenda_motivo TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'Media';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS evidencias TEXT DEFAULT '[]';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS firma_cliente TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS firma_tecnico TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS orden_enviada TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS nodo TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS historial TEXT DEFAULT '[]';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS validada TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS pin_ts TIMESTAMPTZ;`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS aviso_agendada TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS recordatorio_enviado TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS confirmacion TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS confirmacion_enviada TEXT DEFAULT '';`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          pass TEXT NOT NULL,
          pass_plain TEXT DEFAULT '',
          rol TEXT NOT NULL DEFAULT 'tecnico',
          nombre TEXT DEFAULT '',
          tecnico_id INTEGER
        );`);
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pass_plain TEXT DEFAULT '';`);
      await pool.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`);
      await pool.query(`CREATE TABLE IF NOT EXISTS push_subs (id SERIAL PRIMARY KEY, user_id INTEGER, endpoint TEXT UNIQUE, sub TEXT);`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          categoria TEXT DEFAULT 'Otros',
          estado TEXT DEFAULT 'Nuevo',
          factibilidad TEXT DEFAULT '',
          nombre TEXT DEFAULT '',
          telefono TEXT DEFAULT '',
          direccion TEXT DEFAULT '',
          ubicacion TEXT DEFAULT '',
          mensaje TEXT DEFAULT '',
          canal TEXT DEFAULT 'manual',
          notas TEXT DEFAULT '',
          historial TEXT DEFAULT '[]',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );`);
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rut TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';`);
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS adjuntos TEXT DEFAULT '[]';`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_outbox (
          id SERIAL PRIMARY KEY,
          telefono TEXT DEFAULT '',
          texto TEXT DEFAULT '',
          estado TEXT DEFAULT 'pendiente',
          created_at TIMESTAMPTZ DEFAULT now(),
          sent_at TIMESTAMPTZ
        );`);
      await pool.query(`ALTER TABLE bot_outbox ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT '';`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS servicios (
          id SERIAL PRIMARY KEY,
          nombre TEXT DEFAULT '',
          rut TEXT DEFAULT '',
          telefono TEXT DEFAULT '',
          direccion TEXT DEFAULT '',
          email TEXT DEFAULT '',
          plan TEXT DEFAULT '',
          pppoe_user TEXT DEFAULT '',
          estado TEXT DEFAULT 'activo',
          notas TEXT DEFAULT '',
          gps TEXT DEFAULT '',
          mikrowisp_id TEXT DEFAULT '',
          nodo TEXT DEFAULT '',
          ip TEXT DEFAULT '',
          dia_pago TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );`);
      for (const col of ['mikrowisp_id', 'nodo', 'ip', 'dia_pago']) {
        await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS ${col} TEXT DEFAULT '';`);
      }

      // Reset opcional de técnicos (poner RESET_TECNICOS=1 una vez y redeploy)
      if (process.env.RESET_TECNICOS === '1') {
        await pool.query(`DELETE FROM usuarios WHERE rol='tecnico'`);
        await pool.query('DELETE FROM tecnicos');
      }
      // Los técnicos se crean desde la coordinación (no se siembran)
      const vc = await pool.query('SELECT COUNT(*)::int AS n FROM visitas');
      if (vc.rows[0].n === 0) {
        for (const v of SEED.visitas) {
          await pool.query(
            `INSERT INTO visitas (ot,estado,tipo,fecha,bloque,cliente,rut,telefono,direccion,gps,detalle,tecnico)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (ot) DO NOTHING`,
            [v.id, v.estado || '', v.tipo || '', v.fecha || '', v.bloque || '', v.cliente || '', v.rut || '',
             v.telefono || '', v.direccion || '', v.gps || '', v.detalle || '', v.tecnico || '']);
        }
      }
      // Usuarios: 1 coordinador + 1 por técnico
      const uc = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
      if (uc.rows[0].n === 0) {
        await pool.query('INSERT INTO usuarios (username, pass, pass_plain, rol, nombre) VALUES ($1,$2,$3,$4,$5)',
          [ADMIN_USER, hashPassword(ADMIN_PASS), ADMIN_PASS, 'coordinador', 'Coordinación']);
        const { rows: techs } = await pool.query('SELECT * FROM tecnicos ORDER BY id ASC');
        const taken = new Set([ADMIN_USER]);
        for (const t of techs) {
          let u = slugUser(t.nombre || t.rol), base = u, i = 2;
          while (taken.has(u)) u = `${base}${i++}`;
          taken.add(u);
          await pool.query('INSERT INTO usuarios (username, pass, pass_plain, rol, nombre, tecnico_id) VALUES ($1,$2,$3,$4,$5,$6)',
            [u, hashPassword(TECH_PASS), TECH_PASS, 'tecnico', displayTecnico(t.rol, t.nombre), t.id]);
        }
      }
    },
    async getConfig() {
      return loadConfig(async (k) => { const { rows } = await pool.query('SELECT value FROM settings WHERE key=$1', [k]); return rows[0] ? rows[0].value : null; });
    },
    async saveConfig(patch) {
      const gs = async (k) => { const { rows } = await pool.query('SELECT value FROM settings WHERE key=$1', [k]); return rows[0] ? rows[0].value : null; };
      const ss = async (k, v) => { await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, v]); };
      return saveConfigWith(gs, ss, patch);
    },
    async getUserByUsername(u) { const { rows } = await pool.query('SELECT * FROM usuarios WHERE username=$1', [u]); return outU(rows[0]); },
    async getUserById(id) { const { rows } = await pool.query('SELECT * FROM usuarios WHERE id=$1', [id]); return outU(rows[0]); },
    async getTecnicoById(id) { const { rows } = await pool.query('SELECT * FROM tecnicos WHERE id=$1', [id]); return rows[0] ? enrich(rows[0]) : null; },
    async listTecnicos() {
      const { rows } = await pool.query('SELECT * FROM tecnicos ORDER BY activo DESC, id ASC');
      return Promise.all(rows.map(enrich));
    },
    async addTecnico(d) {
      const { rows } = await pool.query(
        'INSERT INTO tecnicos (rol, nombre, telefono, activo) VALUES ($1,$2,$3,$4) RETURNING *',
        [d.rol || 'Técnico', (d.nombre || '').trim(), d.telefono || '', d.activo !== false]);
      const t = rows[0];
      let u = (d.username || '').trim().toLowerCase() || slugUser(t.nombre || t.rol);
      let base = u, i = 2;
      while ((await pool.query('SELECT 1 FROM usuarios WHERE username=$1', [u])).rowCount) u = `${base}${i++}`;
      const plain = (d.password || '').trim() || TECH_PASS;
      await pool.query('INSERT INTO usuarios (username, pass, pass_plain, rol, nombre, tecnico_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [u, hashPassword(plain), plain, 'tecnico', displayTecnico(t.rol, t.nombre), t.id]);
      return enrich(t);
    },
    async updateTecnico(id, patch) {
      const cols = [], vals = []; let i = 1;
      ['rol', 'nombre', 'telefono', 'activo'].forEach((k) => {
        if (k in patch) { cols.push(`${k}=$${i++}`); vals.push(patch[k]); }
      });
      let t;
      if (cols.length) { vals.push(id); const { rows } = await pool.query(`UPDATE tecnicos SET ${cols.join(', ')} WHERE id=$${i} RETURNING *`, vals); t = rows[0]; }
      else { const { rows } = await pool.query('SELECT * FROM tecnicos WHERE id=$1', [id]); t = rows[0]; }
      if (!t) return null;
      // sincronizar usuario vinculado
      await pool.query('UPDATE usuarios SET nombre=$1 WHERE tecnico_id=$2', [displayTecnico(t.rol, t.nombre), id]);
      if (patch.username != null && String(patch.username).trim()) {
        let u = String(patch.username).trim().toLowerCase(), base = u, k = 2;
        while ((await pool.query('SELECT 1 FROM usuarios WHERE username=$1 AND tecnico_id<>$2', [u, id])).rowCount) u = `${base}${k++}`;
        await pool.query('UPDATE usuarios SET username=$1 WHERE tecnico_id=$2', [u, id]);
      }
      if (patch.password != null && String(patch.password).trim()) {
        const plain = String(patch.password).trim();
        await pool.query('UPDATE usuarios SET pass=$1, pass_plain=$2 WHERE tecnico_id=$3', [hashPassword(plain), plain, id]);
      }
      return enrich(t);
    },
    async deleteTecnico(id) { await pool.query('DELETE FROM tecnicos WHERE id=$1', [id]); },
    async getSetting(k) { const { rows } = await pool.query('SELECT value FROM settings WHERE key=$1', [k]); return rows[0] ? rows[0].value : null; },
    async setSetting(k, v) { await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, v]); },
    async listServicios() { const { rows } = await pool.query('SELECT * FROM servicios ORDER BY id DESC'); return rows.map(outS); },
    async getServicio(id) { const { rows } = await pool.query('SELECT * FROM servicios WHERE id=$1', [id]); return rows[0] ? outS(rows[0]) : null; },
    async addServicio(d) {
      const { rows } = await pool.query(
        `INSERT INTO servicios (nombre,rut,telefono,direccion,email,plan,pppoe_user,estado,notas,gps,mikrowisp_id,nodo,ip,dia_pago)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [d.nombre || '', d.rut || '', d.telefono || '', d.direccion || '', d.email || '', d.plan || '', d.pppoe_user || '', d.estado || 'activo', d.notas || '', d.gps || '', d.mikrowisp_id || '', d.nodo || '', d.ip || '', d.dia_pago || '']);
      return outS(rows[0]);
    },
    async updateServicio(id, patch) {
      const cols = [], vals = []; let i = 1;
      SERVICE_FIELDS.forEach((k) => { if (k in patch) { cols.push(`${k}=$${i++}`); vals.push(patch[k]); } });
      if (!cols.length) return null;
      cols.push('updated_at=now()'); vals.push(id);
      const { rows } = await pool.query(`UPDATE servicios SET ${cols.join(', ')} WHERE id=$${i} RETURNING *`, vals);
      return rows[0] ? outS(rows[0]) : null;
    },
    async deleteServicio(id) { await pool.query('DELETE FROM servicios WHERE id=$1', [id]); },
    async savePushSub(userId, sub) { await pool.query('INSERT INTO push_subs (user_id,endpoint,sub) VALUES ($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET sub=$3, user_id=$1', [userId, sub.endpoint, JSON.stringify(sub)]); },
    async listPushSubsByTecnicoId(tid) { const { rows } = await pool.query('SELECT ps.sub FROM push_subs ps JOIN usuarios u ON u.id=ps.user_id WHERE u.tecnico_id=$1', [tid]); return rows.map((r) => { try { return JSON.parse(r.sub); } catch (e) { return null; } }).filter(Boolean); },
    async removePushSubByEndpoint(ep) { await pool.query('DELETE FROM push_subs WHERE endpoint=$1', [ep]); },
    async listVisitas() {
      const { rows } = await pool.query('SELECT * FROM visitas ORDER BY id DESC');
      return rows.map(outV);
    },
    async revSignature(forTecnico) {
      // Sólo columnas ligeras (sin base64): detecta cambios sin leer las fotos
      const where = forTecnico ? 'WHERE tecnico=$1' : '';
      const params = forTecnico ? [forTecnico] : [];
      const { rows } = await pool.query(
        `SELECT id, estado, tecnico, fecha, prioridad, reagenda_solicitada, validada,
                COALESCE(length(detalle),0) AS dl, COALESCE(length(evidencias),0) AS el,
                COALESCE(length(historial),0) AS hl,
                (COALESCE(firma_cliente,'')<>'')::int AS fc, (COALESCE(firma_tecnico,'')<>'')::int AS ft
         FROM visitas ${where} ORDER BY id DESC`, params);
      const part = (r) => [r.id, r.estado, r.tecnico, r.fecha, r.prioridad, r.reagenda_solicitada ? 1 : 0,
        r.validada, r.dl, r.el, r.hl, r.fc, r.ft].join('~');
      let sig = revHash(rows.length + '|' + rows.map(part).join('|'));
      if (!forTecnico) {
        const { rows: tk } = await pool.query(`SELECT id, estado, factibilidad, categoria, updated_at FROM tickets ORDER BY id DESC`);
        sig += '.' + revHash(tk.length + '|' + tk.map((t) => [t.id, t.estado, t.factibilidad, t.categoria, t.updated_at ? new Date(t.updated_at).getTime() : ''].join('~')).join('|'));
      }
      return sig;
    },
    async addVisita(d) {
      const { rows: ex } = await pool.query('SELECT ot FROM visitas');
      const ot = nextOt(ex.map((r) => r.ot), d.tipo);
      const { rows } = await pool.query(
        `INSERT INTO visitas (ot,estado,tipo,fecha,bloque,cliente,rut,telefono,direccion,gps,detalle,tecnico,asignado_por,prioridad,email,nodo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [ot, d.estado || 'Pendiente', d.tipo || '', d.fecha || '', d.bloque || '', d.cliente || '', d.rut || '',
         d.telefono || '', d.direccion || '', d.gps || '', d.detalle || '', d.tecnico || '', d.asignado_por || '', d.prioridad || 'Media', d.email || '', d.nodo || '']);
      return outV(rows[0]);
    },
    async updateVisita(id, patch) {
      const cols = [], vals = []; let i = 1;
      VISIT_FIELDS.forEach((k) => { if (k in patch) { cols.push(`${k}=$${i++}`); vals.push(patch[k]); } });
      if ('ot' in patch && String(patch.ot || '').trim()) { cols.push(`ot=$${i++}`); vals.push(String(patch.ot).trim()); }
      if (!cols.length) return null;
      cols.push(`updated_at=now()`);
      vals.push(id);
      const { rows } = await pool.query(`UPDATE visitas SET ${cols.join(', ')} WHERE id=$${i} RETURNING *`, vals);
      return rows[0] ? outV(rows[0]) : null;
    },
    async deleteVisita(id) { await pool.query('DELETE FROM visitas WHERE id=$1', [id]); },
    async deleteAllVisitas() { const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM visitas'); await pool.query('DELETE FROM visitas'); return rows[0] ? rows[0].n : 0; },
    async listTickets() { const { rows } = await pool.query('SELECT * FROM tickets ORDER BY id DESC'); return rows.map(outTk); },
    async addTicket(d) {
      const { rows } = await pool.query(
        `INSERT INTO tickets (categoria,estado,factibilidad,nombre,telefono,direccion,ubicacion,mensaje,canal,notas,historial)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [d.categoria || 'Otros', d.estado || 'Nuevo', d.factibilidad || '', d.nombre || '', d.telefono || '',
         d.direccion || '', d.ubicacion || '', d.mensaje || '', d.canal || 'manual', d.notas || '', evStr(d.historial)]);
      return outTk(rows[0]);
    },
    async updateTicket(id, patch) {
      const cols = [], vals = []; let i = 1;
      TICKET_FIELDS.forEach((k) => { if (k in patch) { cols.push(`${k}=$${i++}`); vals.push((k === 'historial' || k === 'adjuntos') ? evStr(patch[k]) : patch[k]); } });
      if (!cols.length) return null;
      cols.push('updated_at=now()'); vals.push(id);
      const { rows } = await pool.query(`UPDATE tickets SET ${cols.join(', ')} WHERE id=$${i} RETURNING *`, vals);
      return rows[0] ? outTk(rows[0]) : null;
    },
    async deleteTicket(id) { await pool.query('DELETE FROM tickets WHERE id=$1', [id]); },
    async addOutbox(telefono, texto, tipo) {
      const { rows } = await pool.query(
        `INSERT INTO bot_outbox (telefono, texto, tipo, estado) VALUES ($1,$2,$3,'pendiente') RETURNING *`, [telefono || '', texto || '', tipo || '']);
      return rows[0];
    },
    async listOutboxPending() {
      const { rows } = await pool.query(`SELECT id, telefono, texto, tipo, estado, created_at FROM bot_outbox WHERE estado='pendiente' ORDER BY id ASC LIMIT 50`);
      return rows;
    },
    async markOutboxSent(id) { await pool.query(`UPDATE bot_outbox SET estado='enviado', sent_at=now() WHERE id=$1`, [id]); },
    async setPin(id, pin) { await pool.query(`UPDATE visitas SET pin=$1, pin_ts = CASE WHEN $1 = '' THEN NULL ELSE now() END WHERE id=$2`, [pin, id]); },
    async getPin(id) { const { rows } = await pool.query('SELECT pin, pin_ts FROM visitas WHERE id=$1', [id]); return rows[0] ? { pin: rows[0].pin || '', ts: rows[0].pin_ts || 0 } : { pin: '', ts: 0 }; },
  };
}

let store = null;
async function getStore() {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  store = url ? pgStore(url) : memoryStore();
  await store.init();
  console.log(url ? 'DB: PostgreSQL conectado' : 'DB: modo memoria (sin DATABASE_URL)');
  return store;
}

module.exports = { getStore, CONFIG };
