// ============================================================
// WIFIRED · Servidor Express — API REST + SPA + Auth por rol
// ============================================================
const express = require('express');
const path = require('path');
const { getStore } = require('./db.js');
const { verifyPassword, signToken, verifyToken } = require('./server-auth.js');
const { sendOrden, sendEvidencia, sendPin, mailConfigured } = require('./mailer.js');
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

const COMPANY = {
  nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
  direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
  fonos: ['569 89798503', '569 99967675'],
  email: 'Soporte@wifired.cl',
  autoriza: 'Martin Ballesteros Escarate',
};

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json({ limit: '1mb' }));

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
  res.json({ visitas, tecnicos, config, me, persistent, mail });
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

  // Copia de evidencia al correo de archivo cuando el técnico cierra/pide reagenda/queda pendiente
  if (req.user.rol === 'tecnico' && (patch.estado === 'Completada' || patch.estado === 'Cancelada' || patch.reagenda_solicitada || patch.validada === 'pendiente')) {
    const vEv = v;
    s.getConfig().then((cfg) => {
      if (cfg.evidencia_email) sendEvidencia(vEv, cfg.empresa || COMPANY, cfg.evidencia_email).catch(() => {});
    }).catch(() => {});
  }
  // Aviso push al técnico cuando la coordinación asigna o reagenda
  if (req.user.rol !== 'tecnico') {
    if ('tecnico' in body && body.tecnico) notifyAssign(v, 'asignar');
    else if ('fecha' in body && v.tecnico) notifyAssign(v, 'reagenda');
  }
  res.json({ ...v, _email: email_result });
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
  if (!r.ok) return res.status(502).json({ error: 'No se pudo enviar el código: ' + (r.reason || '') });
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

api.delete('/visitas/:id', auth, soloCoordinador, wrap(async (req, res) => {
  await (await getStore()).deleteVisita(req.params.id); res.json({ ok: true });
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
  .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`WIFIRED Agenda — servidor en http://0.0.0.0:${PORT}`)))
  .catch((e) => { console.error('Fallo al iniciar:', e); process.exit(1); });
