// ============================================================
// WIFIRED · Servidor Express — API REST + SPA + Auth por rol
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const { getStore } = require('./db.js');
const { verifyPassword, signToken, verifyToken } = require('./server-auth.js');
const { sendOrden, sendPin, sendClienteAviso, sendRespaldo, ordenPDF, mailConfigured } = require('./mailer.js');
const { publicKey, saveSubscription, notifyTecnicoById } = require('./push.js');

/** Datos de empresa desde la configuración (con respaldo al valor por defecto) */
async function companyInfo() {
  try { const c = await (await getStore()).getConfig(); return c.empresa || COMPANY; } catch (e) { return COMPANY; }
}

/** Notifica al técnico asignado a una visita (push) */
async function notifyAssign(v, kind) {
  try {
    if (!v || !v.tecnico) return;
    const s = await getStore();
    const t = (await s.listTecnicos()).find((x) => x.display === v.tecnico);
    if (!t) return;
    const titulo = kind === 'reagenda' ? 'Visita reagendada' : 'Nueva visita asignada';
    const cuerpo = `${v.cliente || 'Cliente'} · ${v.tipo || ''}${v.fecha ? ' · ' + v.fecha : ''}`;
    notifyTecnicoById(t.id, { title: titulo, body: cuerpo, url: '/' }).catch(() => {});
  } catch (e) {}
}

const ESTADOS_ACTIVOS = ['Pendiente', 'Programada', 'Reprogramada'];

/** Normaliza un teléfono a sus últimos 9 dígitos (para comparar clientes) */
function normFono(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('56')) d = d.slice(2);
  return d.length >= 8 ? d.slice(-9) : '';
}

/** ¿La coordinación tiene encendidos los avisos automáticos al cliente? */
async function avisosActivos() {
  try { const c = await (await getStore()).getConfig(); return c.avisos_cliente !== false; } catch (e) { return true; }
}

/**
 * Envía (una sola vez) al cliente el aviso de que su visita quedó agendada.
 * Se dispara al crear la visita y al asignarle fecha por primera vez.
 * No bloquea la respuesta: se llama sin await.
 */
async function avisarClienteAgendada(v) {
  try {
    if (!v || v.aviso_agendada) return;            // ya se avisó antes
    if (!v.email || !v.fecha) return;              // sin correo o sin fecha no hay qué avisar
    if (!ESTADOS_ACTIVOS.includes(v.estado)) return;
    if (!mailConfigured() || !(await avisosActivos())) return;
    const r = await sendClienteAviso(v, await companyInfo(), 'agendada');
    if (r.ok) {
      await (await getStore()).updateVisita(v._uid, { aviso_agendada: new Date().toISOString() });
      console.log(`[AVISO] agendada enviado a ${v.email} · visita ${v.id}`);
    } else {
      console.warn(`[AVISO] agendada NO enviado a ${v.email} · visita ${v.id} · ${r.reason || ''}`);
    }
  } catch (e) { console.warn('[AVISO] error agendada:', e.message); }
}

// ---------- Recordatorio automático del día antes ----------
/** Fecha de hoy en Chile (YYYY-MM-DD) */
function hoyChile() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); }
/** Hora (0-23) actual en Chile */
function horaChile() { return parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }), 10) || 0; }
/** Suma días a una fecha ISO (YYYY-MM-DD) */
function sumaDiasISO(iso, n) {
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2] + n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

let ultimoRecordatorio = ''; // día (Chile) en que ya se corrió el envío de recordatorios
const HORA_RECORDATORIO = parseInt(process.env.HORA_RECORDATORIO || '18', 10); // 18:00 Chile por defecto

/** Revisa si toca enviar los recordatorios de mañana y los envía una vez al día */
async function correrRecordatorios() {
  try {
    if (!mailConfigured()) return;
    const hoy = hoyChile();
    if (ultimoRecordatorio === hoy) return;         // ya se corrió hoy
    if (horaChile() < HORA_RECORDATORIO) return;    // aún no es la hora
    if (!(await avisosActivos())) { ultimoRecordatorio = hoy; return; }
    ultimoRecordatorio = hoy;
    const manana = sumaDiasISO(hoy, 1);
    const s = await getStore();
    const [visitas, company] = await Promise.all([s.listVisitas(), companyInfo()]);
    const pendientes = visitas.filter((v) => v.fecha === manana && v.email
      && ESTADOS_ACTIVOS.includes(v.estado) && v.recordatorio_enviado !== manana);
    let ok = 0;
    for (const v of pendientes) {
      const r = await sendClienteAviso(v, company, 'recordatorio');
      if (r.ok) { await s.updateVisita(v._uid, { recordatorio_enviado: manana }); ok++; }
      else console.warn(`[RECORDATORIO] NO enviado a ${v.email} · visita ${v.id} · ${r.reason || ''}`);
    }
    if (pendientes.length) console.log(`[RECORDATORIO] ${ok}/${pendientes.length} enviados para ${manana}`);
  } catch (e) { console.warn('[RECORDATORIO] error:', e.message); }
}

// ---------- Confirmación automática de visitas por WhatsApp ----------
let ultimaConfirmacion = ''; // día (Chile) en que ya se corrió el envío de confirmaciones

/** Fecha legible en español a partir de "YYYY-MM-DD" (ej: "viernes 22 de agosto") */
function fechaLegible(iso) {
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' }); }
  catch (e) { return iso || ''; }
}
/** Rellena la plantilla de confirmación con los datos de la visita */
function plantillaConfirma(tpl, v) {
  return String(tpl || '')
    .replace(/\{nombre\}/gi, (v.cliente || '').trim().split(/\s+/)[0] || '')
    .replace(/\{fecha\}/gi, fechaLegible(v.fecha))
    .replace(/\{bloque\}/gi, v.bloque || '');
}

/** Revisa si toca pedir confirmación de las visitas de mañana y encola los WhatsApp una vez al día */
async function correrConfirmaciones() {
  try {
    const s = await getStore();
    if (typeof s.addOutbox !== 'function') return;
    const cfg = await s.getConfig();
    const cv = (cfg.bot && cfg.bot.confirma_visita) || {};
    if (!cv.activo) return;                          // desactivado desde la página
    const hoy = hoyChile();
    if (ultimaConfirmacion === hoy) return;          // ya se corrió hoy
    const hora = Number.isFinite(cv.hora) ? cv.hora : 18;
    if (horaChile() < hora) return;                  // aún no es la hora
    ultimaConfirmacion = hoy;
    const manana = sumaDiasISO(hoy, 1);
    const visitas = await s.listVisitas();
    const pendientes = visitas.filter((v) => v.fecha === manana && v.telefono
      && ESTADOS_ACTIVOS.includes(v.estado) && v.confirmacion_enviada !== manana);
    let ok = 0;
    for (const v of pendientes) {
      await s.addOutbox(v.telefono, plantillaConfirma(cv.mensaje, v), 'confirmacion');
      await s.updateVisita(v._uid, { confirmacion_enviada: manana, confirmacion: '' });
      ok++;
    }
    if (pendientes.length) console.log(`[CONFIRMACION] ${ok}/${pendientes.length} solicitudes encoladas para ${manana}`);
  } catch (e) { console.warn('[CONFIRMACION] error:', e.message); }
}

// ---------- Respaldo de datos ----------
/**
 * Arma un respaldo con todos los registros operativos.
 * light=true quita las fotos/firmas (base64) para que quepa en un correo;
 * conserva todo el texto (clientes, visitas, asignaciones, estados, notas).
 */
async function buildBackup(light) {
  const s = await getStore();
  const [visitas, tecnicos, config] = await Promise.all([s.listVisitas(), s.listTecnicos(), s.getConfig()]);
  const tec = tecnicos.map((t) => ({ id: t.id, rol: t.rol, nombre: t.nombre, telefono: t.telefono, activo: t.activo, display: t.display }));
  let vis = visitas;
  if (light) {
    vis = visitas.map((v) => {
      const { firma_cliente, firma_tecnico, evidencias, historial, ...rest } = v;
      return { ...rest, fotos: (evidencias || []).length, eventos: (historial || []).length };
    });
  }
  return { version: 1, exported_at: new Date().toISOString(), visitas: vis, tecnicos: tec, config };
}

let ultimoRespaldo = ''; // día (Chile) en que ya se corrió el respaldo automático
const HORA_RESPALDO = parseInt(process.env.HORA_RESPALDO || '3', 10); // 03:00 Chile por defecto

/** Respaldo automático diario: guarda en BACKUP_DIR y/o envía a BACKUP_EMAIL */
async function correrRespaldo() {
  try {
    const dir = process.env.BACKUP_DIR;
    const email = process.env.BACKUP_EMAIL;
    if (!dir && !(email && mailConfigured())) return; // nada configurado: no hace nada
    const hoy = hoyChile();
    if (ultimoRespaldo === hoy) return;
    if (horaChile() < HORA_RESPALDO) return;
    ultimoRespaldo = hoy;
    const filename = `respaldo_wifired_${hoy}.json`;

    if (dir) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, filename), JSON.stringify(await buildBackup(false)));
        // conservar sólo los últimos 14 respaldos
        const files = fs.readdirSync(dir).filter((f) => /^respaldo_wifired_.*\.json$/.test(f)).sort();
        while (files.length > 14) { try { fs.unlinkSync(path.join(dir, files.shift())); } catch (e) {} }
        console.log(`[RESPALDO] guardado en ${dir}/${filename}`);
      } catch (e) { console.warn('[RESPALDO] no se pudo escribir archivo:', e.message); }
    }
    if (email && mailConfigured()) {
      const light = await buildBackup(true);
      const b64 = Buffer.from(JSON.stringify(light, null, 2), 'utf8').toString('base64');
      const r = await sendRespaldo(email, filename, b64, `${light.visitas.length} visitas · ${light.tecnicos.length} técnicos`);
      if (r.ok) console.log(`[RESPALDO] enviado por correo a ${email}`);
      else console.warn(`[RESPALDO] correo NO enviado a ${email} · ${r.reason || ''}`);
    }
  } catch (e) { console.warn('[RESPALDO] error:', e.message); }
}

const COMPANY = {
  nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
  direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
  fonos: ['569 89798503', '569 99967675'],
  email: 'Soporte@wifired.cl',
  autoriza: 'Martin Ballesteros Escarate',
};

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json({ limit: '20mb' })); // amplio para fotos (carnet en contratación, evidencias)

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Error interno del servidor' }); });

// Middleware de autenticación
async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const p = verifyToken(h.replace(/^Bearer\s+/i, ''));
    if (!p) return res.status(401).json({ error: 'Sesión no válida' });
    const s = await getStore();
    const user = await s.getUserById(p.uid);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    next();
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno del servidor' }); }
}
const soloCoordinador = (req, res, next) =>
  req.user.rol === 'coordinador' ? next() : res.status(403).json({ error: 'Acción sólo para coordinación' });

/** Devuelve el string de visualización del técnico del usuario */
async function techDisplay(user) {
  if (!user.tecnico_id) return null;
  const s = await getStore();
  const t = await s.getTecnicoById(user.tecnico_id);
  return t ? t.display : null;
}

const api = express.Router();

// --- Login ---
api.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const s = await getStore();
  const user = await s.getUserByUsername((username || '').trim().toLowerCase());
  if (!user || !verifyPassword(password || '', user.pass)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = signToken({ uid: user.id, rol: user.rol });
  const display = await techDisplay(user);
  res.json({ token, user: { id: user.id, nombre: user.nombre, rol: user.rol, tecnico: display, username: user.username } });
}));

api.get('/me', auth, wrap(async (req, res) => {
  res.json({ id: req.user.id, nombre: req.user.nombre, rol: req.user.rol, tecnico: await techDisplay(req.user), username: req.user.username });
}));

// --- Bootstrap (filtra por rol) ---
api.get('/bootstrap', auth, wrap(async (req, res) => {
  const s = await getStore();
  const [visitas, tecnicos, config] = await Promise.all([s.listVisitas(), s.listTecnicos(), s.getConfig()]);
  const me = { id: req.user.id, nombre: req.user.nombre, rol: req.user.rol, tecnico: await techDisplay(req.user), username: req.user.username };
  const persistent = !!process.env.DATABASE_URL;
  const mail = mailConfigured();
  if (req.user.rol === 'tecnico') {
    const mine = visitas.filter((v) => v.tecnico === me.tecnico);
    return res.json({ visitas: mine, tecnicos: tecnicos.filter((t) => t.id === req.user.tecnico_id), config, me, persistent, mail });
  }
  const tickets = typeof s.listTickets === 'function' ? await s.listTickets() : [];
  res.json({ visitas, tecnicos, config, me, persistent, mail, tickets });
}));

// --- Revisión ligera: firma corta para saber si hubo cambios (sin transferir fotos) ---
api.get('/rev', auth, wrap(async (req, res) => {
  const s = await getStore();
  const forTec = req.user.rol === 'tecnico' ? await techDisplay(req.user) : null;
  const rev = await s.revSignature(forTec);
  res.json({ rev });
}));

// --- Visitas ---
// El técnico completa/cancela, deja notas, SOLICITA reagenda, adjunta evidencias y firmas
const CAMPOS_TECNICO = ['detalle', 'reagenda_solicitada', 'reagenda_motivo', 'evidencias', 'email', 'firma_cliente', 'firma_tecnico', 'historial'];

/** Genera un PIN aleatorio de 6 dígitos */
function nuevoPin() { return String(Math.floor(100000 + Math.random() * 900000)); }
const PIN_VIGENCIA_MS = 30 * 60 * 1000; // 30 minutos

api.post('/visitas', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (!req.body || !req.body.cliente) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
  const data = { ...req.body };
  if (data.tecnico) data.asignado_por = req.user.nombre;
  const nueva = await s.addVisita(data);
  if (nueva.tecnico) notifyAssign(nueva, 'asignar');
  avisarClienteAgendada(nueva); // confirmación al cliente (sin bloquear la respuesta)
  res.status(201).json(nueva);
}));

api.put('/visitas/:id', auth, wrap(async (req, res) => {
  const s = await getStore();
  const body = req.body || {};
  let patch = {};
  if (req.user.rol === 'tecnico') {
    // sólo sus propias visitas y sólo campos permitidos
    const own = (await s.listVisitas()).find((v) => v._uid === String(req.params.id));
    const display = await techDisplay(req.user);
    if (!own || own.tecnico !== display) return res.status(403).json({ error: 'No puedes modificar esta visita' });
    CAMPOS_TECNICO.forEach((k) => { if (k in body) patch[k] = body[k]; });
    // el técnico sólo puede marcar Cancelada libremente; Completada exige PIN válido
    if (body.estado === 'Cancelada') patch.estado = 'Cancelada';
    if (body.estado === 'Completada') {
      // Requiere el código (PIN) que el cliente recibió por correo
      const stored = await (s.getPin ? s.getPin(req.params.id) : Promise.resolve({ pin: '', ts: 0 }));
      const ingresado = String(body.pin_ingresado || '').trim();
      const tsMs = stored && stored.ts ? new Date(stored.ts).getTime() : 0;
      const vigente = tsMs && (Date.now() - tsMs) < PIN_VIGENCIA_MS;
      if (!stored || !stored.pin || ingresado !== stored.pin || !vigente) {
        return res.status(403).json({ error: 'Código de validación incorrecto o vencido. Reenvía el código al cliente e inténtalo de nuevo.' });
      }
      patch.estado = 'Completada';
      patch.validada = 'pin';
    }
    // Fallback: el cliente no puede entregar el código → queda pendiente de autorización por coordinación
    if (body.validada === 'pendiente') patch.validada = 'pendiente';
    // al SOLICITAR reagenda, la visita pasa a Pendiente (espera nueva fecha de coordinación)
    if (patch.reagenda_solicitada) patch.estado = 'Pendiente';
  } else {
    patch = { ...body };
    delete patch.pin_ingresado;
    // N° de OT editable por coordinación (no puede quedar vacío ni repetirse)
    if ('ot' in body) {
      const nuevoOt = String(body.ot || '').trim();
      if (!nuevoOt) return res.status(400).json({ error: 'El N° de OT no puede quedar vacío' });
      const all = await s.listVisitas();
      if (all.some((v) => v.id === nuevoOt && v._uid !== String(req.params.id))) {
        return res.status(400).json({ error: `El N° de OT "${nuevoOt}" ya existe en otra visita` });
      }
      patch.ot = nuevoOt;
    }
    if ('tecnico' in body) patch.asignado_por = body.tecnico ? req.user.nombre : '';
    // coordinación autoriza manualmente (fallback cuando el PIN no llegó al cliente)
    if (body.estado === 'Completada' && !body.validada) patch.validada = 'coordinacion';
    // al reagendar/editar fecha, se resuelve la solicitud pendiente
    if ('fecha' in body || 'estado' in body) { patch.reagenda_solicitada = ''; patch.reagenda_motivo = ''; }
  }
  let v = await s.updateVisita(req.params.id, patch);
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });

  // Ya validada/cerrada: el código de un solo uso deja de ser válido
  if (patch.estado === 'Completada' && s.setPin) s.setPin(req.params.id, '').catch(() => {});

  // Al completar: enviar la orden firmada al correo del cliente (si hay correo)
  let email_result = null;
  if (patch.estado === 'Completada' && v.email && !v.orden_enviada) {
    email_result = await sendOrden(v, await companyInfo());
    if (email_result.ok) {
      v = await s.updateVisita(req.params.id, { orden_enviada: new Date().toISOString() });
    }
  }

  // Aviso push al técnico cuando la coordinación asigna o reagenda
  if (req.user.rol !== 'tecnico') {
    if ('tecnico' in body && body.tecnico) notifyAssign(v, 'asignar');
    else if ('fecha' in body && v.tecnico) notifyAssign(v, 'reagenda');
    avisarClienteAgendada(v); // confirmación al cliente si recién ahora tiene fecha (una sola vez)
  }
  res.json({ ...v, _email: email_result });
}));

// Descargar la orden de trabajo en PDF (la misma que se envía al cliente/soporte)
api.get('/visitas/:id/orden.pdf', auth, wrap(async (req, res) => {
  const s = await getStore();
  const v = (await s.listVisitas()).find((x) => x._uid === String(req.params.id));
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });
  if (req.user.rol === 'tecnico') {
    const display = await techDisplay(req.user);
    if (v.tecnico !== display) return res.status(403).json({ error: 'No puedes ver esta orden' });
  }
  const pdf = await ordenPDF(v, await companyInfo());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="orden_${v.id}.pdf"`);
  res.send(pdf);
}));

// Enviar/reenviar el código (PIN) de validación al correo del cliente
api.post('/visitas/:id/enviar-pin', auth, wrap(async (req, res) => {
  const s = await getStore();
  const v = (await s.listVisitas()).find((x) => x._uid === String(req.params.id));
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });
  if (req.user.rol === 'tecnico') {
    const display = await techDisplay(req.user);
    if (v.tecnico !== display) return res.status(403).json({ error: 'No puedes validar esta visita' });
  }
  const email = ((req.body && req.body.email) || v.email || '').trim();
  if (!email) return res.status(400).json({ error: 'El cliente no tiene correo para recibir el código' });
  if (!mailConfigured()) return res.status(400).json({ error: 'Correo no configurado en el servidor (BREVO_API_KEY o RESEND_API_KEY)' });
  const pin = nuevoPin();
  if (!s.setPin) return res.status(400).json({ error: 'Validación por código no disponible en este modo' });
  await s.setPin(req.params.id, pin);
  // guardar el correo del cliente si vino nuevo
  if (req.body && req.body.email && req.body.email !== v.email) await s.updateVisita(req.params.id, { email });
  const r = await sendPin(v, email, pin);
  if (!r.ok) {
    console.warn(`[PIN] FALLÓ envío a ${email} · visita ${v.id} · ${new Date().toISOString()} · ${r.reason || ''}`);
    return res.status(502).json({ error: 'No se pudo enviar el código: ' + (r.reason || '') });
  }
  console.log(`[PIN] enviado a ${email} · visita ${v.id} · solicitado por ${req.user.rol} · ${new Date().toISOString()}`);
  res.json({ ok: true, email });
}));

// Reenviar la orden al cliente (coordinación)
api.post('/visitas/:id/enviar-orden', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  const v = (await s.listVisitas()).find((x) => x._uid === String(req.params.id));
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });
  const r = await sendOrden(v, await companyInfo());
  if (r.ok) await s.updateVisita(req.params.id, { orden_enviada: new Date().toISOString() });
  res.json(r);
}));

// --- Configuración (sólo coordinación edita) ---
api.get('/config', auth, wrap(async (req, res) => res.json(await (await getStore()).getConfig())));
api.put('/config', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.saveConfig !== 'function') return res.status(400).json({ error: 'Configuración no editable en este modo' });
  res.json(await s.saveConfig(req.body || {}));
}));

// Descargar un respaldo completo de los registros (sólo coordinación)
api.get('/backup', auth, soloCoordinador, wrap(async (req, res) => {
  const data = await buildBackup(false);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="respaldo_wifired_${hoyChile()}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

// Vaciar TODO el historial de visitas (sólo coordinación). Irreversible:
// exige la frase de confirmación exacta en el cuerpo para evitar accidentes.
// No toca técnicos ni configuración; sólo borra las visitas.
api.post('/visitas/limpiar-todo', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.deleteAllVisitas !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  if (!req.body || req.body.confirmar !== 'BORRAR TODO') return res.status(400).json({ error: 'Confirmación requerida' });
  const n = await s.deleteAllVisitas();
  res.json({ ok: true, borradas: n });
}));

api.delete('/visitas/:id', auth, soloCoordinador, wrap(async (req, res) => {
  await (await getStore()).deleteVisita(req.params.id); res.json({ ok: true });
}));

// --- Tickets de atención (WhatsApp / manual) — sólo coordinación ---
api.get('/tickets', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  res.json(typeof s.listTickets === 'function' ? await s.listTickets() : []);
}));
api.post('/tickets', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.addTicket !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const b = req.body || {};
  if (!b.categoria && !b.nombre && !b.mensaje && !b.telefono) return res.status(400).json({ error: 'Faltan datos del ticket' });
  res.status(201).json(await s.addTicket(b));
}));
api.put('/tickets/:id', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.updateTicket !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const t = await s.updateTicket(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: 'Ticket no encontrado' });
  res.json(t);
}));
api.delete('/tickets/:id', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.deleteTicket === 'function') await s.deleteTicket(req.params.id);
  res.json({ ok: true });
}));

// Enviar los planes al cliente por WhatsApp (encola el mensaje para el bot)
api.post('/tickets/:id/enviar-planes', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.addOutbox !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const t = (typeof s.listTickets === 'function' ? await s.listTickets() : []).find((x) => x._uid === String(req.params.id));
  if (!t) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (!t.telefono) return res.status(400).json({ error: 'El ticket no tiene teléfono del cliente' });
  const c = await s.getConfig();
  const texto = (req.body && req.body.texto) || (c.bot && c.bot.planes) || '';
  if (!texto.trim()) return res.status(400).json({ error: 'No hay texto de planes configurado' });
  await s.addOutbox(t.telefono, texto);
  const upd = await s.updateTicket(req.params.id, { factibilidad: 'planes_enviados', estado: 'En proceso' });
  console.log(`[BOT] planes encolados para ${t.telefono} (ticket ${t.num})`);
  res.json({ ok: true, ticket: upd });
}));

// Endpoint del bot de WhatsApp: crea tickets con una clave propia (no JWT).
// El bot corre en el mismo servidor y llega por http://localhost:PORT.
function requireBotKey(req, res, next) {
  const key = process.env.BOT_API_KEY;
  if (!key) return res.status(503).json({ error: 'Bot no configurado (falta BOT_API_KEY)' });
  if ((req.headers['x-bot-key'] || '') !== key) return res.status(401).json({ error: 'Clave de bot inválida' });
  next();
}
api.post('/bot/ticket', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.addTicket !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const b = req.body || {};
  b.canal = 'whatsapp';
  if (!b.estado) b.estado = 'Nuevo';
  if (b.categoria === 'Contratación' && !b.factibilidad) b.factibilidad = 'pendiente';
  const t = await s.addTicket(b);
  console.log(`[BOT] ticket ${t.num} creado · ${t.categoria} · ${b.telefono || ''}`);
  res.status(201).json(t);
}));

// El cliente eligió un plan tras recibir la lista: ACTUALIZA su ticket de
// Contratación existente (no crea uno nuevo). Si no hay ninguno abierto, crea uno.
api.post('/bot/plan-elegido', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.addTicket !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const b = req.body || {};
  const tel = normFono(b.telefono || '');
  const eleccion = String(b.eleccion || '').slice(0, 300);
  const nota = `Cliente eligió: ${eleccion}`;
  let ticket = null;
  if (tel && typeof s.listTickets === 'function') {
    const abiertos = (await s.listTickets()).filter((t) =>
      t.categoria === 'Contratación' && normFono(t.telefono) === tel && t.estado !== 'Cerrado');
    ticket = abiertos[0] || null; // listTickets viene del más nuevo al más viejo
  }
  if (ticket && typeof s.updateTicket === 'function') {
    const mensaje = ticket.mensaje ? `${ticket.mensaje}\n${nota}` : nota;
    const upd = await s.updateTicket(ticket._uid, { mensaje, estado: 'En proceso' });
    console.log(`[BOT] ticket ${upd.num} actualizado · plan elegido · ${b.telefono || ''}`);
    return res.json({ ok: true, actualizado: true, num: upd.num });
  }
  const t = await s.addTicket({ categoria: 'Contratación', canal: 'whatsapp', estado: 'En proceso',
    factibilidad: 'planes_enviados', nombre: b.nombre || '', telefono: b.telefono || '', mensaje: nota });
  console.log(`[BOT] ticket ${t.num} creado (sin previo) · plan elegido · ${b.telefono || ''}`);
  res.status(201).json({ ok: true, actualizado: false, num: t.num });
}));

// El cliente completó el proceso de contratación por el bot: guardamos TODOS sus datos
// (nombre, rut, teléfono, correo, dirección, fotos del carnet y aceptación de condiciones)
// en su ticket de Contratación existente.
api.post('/bot/contratacion-datos', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.addTicket !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const b = req.body || {};
  const tel = normFono(b.telefono || '');
  const adjuntos = [];
  if (b.carnet_frente) adjuntos.push({ tipo: 'Carnet (frente)', data: b.carnet_frente });
  if (b.carnet_reverso) adjuntos.push({ tipo: 'Carnet (reverso)', data: b.carnet_reverso });
  const resumen = [
    `📋 *Contratación por WhatsApp*`,
    b.plan ? `Plan elegido: ${b.plan}` : '',
    b.rut ? `RUT: ${b.rut}` : '',
    b.telefono_declarado ? `Teléfono de contacto: ${b.telefono_declarado}` : '',
    b.correo ? `Correo: ${b.correo}` : '',
    b.carnet_consentimiento === 'autorizado' ? 'Carnet (uso de datos): AUTORIZADO ✅' : 'Carnet (uso de datos): sin autorizar',
    b.condiciones === 'aceptadas' ? 'Condiciones: ACEPTADAS ✅' : 'Condiciones: sin aceptar',
    adjuntos.length ? `Carnet: ${adjuntos.length} foto(s) adjunta(s)` : 'Carnet: sin fotos',
  ].filter(Boolean).join('\n');
  const patch = {
    nombre: b.nombre || '', telefono: b.telefono || '', direccion: b.direccion || '', ubicacion: b.ubicacion || '',
    rut: b.rut || '', email: b.correo || '', adjuntos, mensaje: resumen,
    estado: 'En proceso', factibilidad: 'planes_enviados',
  };
  let ticket = null;
  if (tel && typeof s.listTickets === 'function') {
    const abiertos = (await s.listTickets()).filter((t) => t.categoria === 'Contratación' && normFono(t.telefono) === tel && t.estado !== 'Cerrado');
    ticket = abiertos[0] || null;
  }
  if (ticket && typeof s.updateTicket === 'function') {
    const upd = await s.updateTicket(ticket._uid, patch);
    console.log(`[BOT] contratación completada · ticket ${upd.num} · ${b.telefono || ''}`);
    return res.json({ ok: true, actualizado: true, num: upd.num });
  }
  const t = await s.addTicket({ categoria: 'Contratación', canal: 'whatsapp', ...patch });
  console.log(`[BOT] contratación completada · ticket ${t.num} (nuevo) · ${b.telefono || ''}`);
  res.status(201).json({ ok: true, actualizado: false, num: t.num });
}));

// El cliente respondió SÍ/NO a la confirmación de su visita.
// SÍ → marca confirmada; NO → cancela la visita.
api.post('/bot/confirmar-visita', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  const b = req.body || {};
  const tel = normFono(b.telefono || '');
  const resp = String(b.respuesta || '').toLowerCase();
  if (!tel || typeof s.listVisitas !== 'function') return res.json({ found: false });
  const cand = (await s.listVisitas())
    .filter((v) => normFono(v.telefono) === tel && v.confirmacion_enviada && !v.confirmacion && ESTADOS_ACTIVOS.includes(v.estado))
    .sort((a, b2) => (a.fecha || '').localeCompare(b2.fecha || ''));
  const v = cand[0];
  if (!v) return res.json({ found: false });
  if (resp === 'no') {
    await s.updateVisita(v._uid, { confirmacion: 'no', estado: 'Cancelada', reagenda_motivo: 'Cliente canceló al confirmar por WhatsApp' });
    console.log(`[CONFIRMACION] visita ${v.id} CANCELADA por el cliente`);
    return res.json({ found: true, accion: 'cancelada', fecha: v.fecha });
  }
  await s.updateVisita(v._uid, { confirmacion: 'si' });
  console.log(`[CONFIRMACION] visita ${v.id} CONFIRMADA por el cliente`);
  return res.json({ found: true, accion: 'confirmada', fecha: v.fecha });
}));

// Enviar la confirmación de una visita AHORA (manual, para probar sin esperar la hora)
api.post('/visitas/:id/confirmar-ahora', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.addOutbox !== 'function') return res.status(400).json({ error: 'No disponible en este modo' });
  const v = (await s.listVisitas()).find((x) => x._uid === String(req.params.id));
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });
  if (!v.telefono) return res.status(400).json({ error: 'La visita no tiene teléfono del cliente' });
  const cfg = await s.getConfig();
  const cv = (cfg.bot && cfg.bot.confirma_visita) || {};
  await s.addOutbox(v.telefono, plantillaConfirma(cv.mensaje, v), 'confirmacion');
  await s.updateVisita(req.params.id, { confirmacion_enviada: v.fecha || hoyChile(), confirmacion: '' });
  console.log(`[CONFIRMACION] solicitud manual encolada · visita ${v.id}`);
  res.json({ ok: true });
}));

// El bot lee la configuración (saludo, planes, horario) desde la app
api.get('/bot/config', requireBotKey, wrap(async (req, res) => {
  const c = await (await getStore()).getConfig();
  res.json(c.bot || {});
}));

// Bandeja de salida: mensajes automáticos que el bot debe enviar por WhatsApp
api.get('/bot/outbox', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  res.json(typeof s.listOutboxPending === 'function' ? await s.listOutboxPending() : []);
}));
api.post('/bot/outbox/:id/sent', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  if (typeof s.markOutboxSent === 'function') await s.markOutboxSent(req.params.id);
  res.json({ ok: true });
}));

// El bot consulta el estado de la visita activa de un cliente por su teléfono
api.get('/bot/visita', requireBotKey, wrap(async (req, res) => {
  const s = await getStore();
  const tel = normFono(req.query.telefono || '');
  if (!tel) return res.json({ found: false });
  const visitas = await s.listVisitas();
  const match = visitas.filter((v) => normFono(v.telefono) === tel)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const activa = match.find((v) => ESTADOS_ACTIVOS.includes(v.estado)) || match[0];
  if (!activa) return res.json({ found: false });
  res.json({ found: true, estado: activa.estado, fecha: activa.fecha || '', tecnico: activa.tecnico || '', tipo: activa.tipo || '' });
}));

// --- Técnicos (sólo coordinación administra) ---
api.get('/tecnicos', auth, wrap(async (req, res) => res.json(await (await getStore()).listTecnicos())));
api.post('/tecnicos', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (!req.body || (!req.body.nombre && !req.body.rol)) return res.status(400).json({ error: 'Nombre o rol requerido' });
  res.status(201).json(await s.addTecnico(req.body));
}));
api.put('/tecnicos/:id', auth, soloCoordinador, wrap(async (req, res) => {
  const t = await (await getStore()).updateTecnico(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: 'Técnico no encontrado' });
  res.json(t);
}));
api.delete('/tecnicos/:id', auth, soloCoordinador, wrap(async (req, res) => {
  await (await getStore()).deleteTecnico(req.params.id); res.json({ ok: true });
}));

// --- Notificaciones push ---
api.get('/push/config', auth, wrap(async (req, res) => res.json({ publicKey: await publicKey() })));
api.post('/push/subscribe', auth, wrap(async (req, res) => {
  await saveSubscription(req.user.id, req.body && req.body.subscription);
  res.json({ ok: true });
}));

api.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', api);

// --- Estáticos (SPA) ---
app.use(express.static(__dirname, { etag: true, lastModified: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

getStore()
  .then(() => app.listen(PORT, '0.0.0.0', () => {
    console.log(`WIFIRED Agenda — servidor en http://0.0.0.0:${PORT}`);
    // Recordatorios del día antes + respaldo automático: se revisan cada 30 min y
    // se ejecutan una vez al día (según hora de Chile). Sin nada configurado, no hacen nada.
    const tick = () => { correrRecordatorios(); correrConfirmaciones(); correrRespaldo(); };
    tick();
    setInterval(tick, 30 * 60 * 1000);
  }))
  .catch((e) => { console.error('Fallo al iniciar:', e); process.exit(1); });
