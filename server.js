// ============================================================
// WIFIRED · Servidor Express — API REST + SPA + Auth por rol
// ============================================================
const express = require('express');
const path = require('path');
const { getStore } = require('./db.js');
const { verifyPassword, signToken, verifyToken } = require('./server-auth.js');
const { sendOrden, mailConfigured } = require('./mailer.js');

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
const CAMPOS_TECNICO = ['detalle', 'reagenda_solicitada', 'reagenda_motivo', 'evidencias', 'email', 'firma_cliente', 'firma_tecnico'];

api.post('/visitas', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  if (!req.body || !req.body.cliente) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
  const data = { ...req.body };
  if (data.tecnico) data.asignado_por = req.user.nombre;
  res.status(201).json(await s.addVisita(data));
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
    // el técnico sólo puede marcar Completada o Cancelada
    if (['Completada', 'Cancelada'].includes(body.estado)) patch.estado = body.estado;
    // al SOLICITAR reagenda, la visita pasa a Pendiente (espera nueva fecha de coordinación)
    if (patch.reagenda_solicitada) patch.estado = 'Pendiente';
  } else {
    patch = { ...body };
    if ('tecnico' in body) patch.asignado_por = body.tecnico ? req.user.nombre : '';
    // al reagendar/editar fecha, se resuelve la solicitud pendiente
    if ('fecha' in body || 'estado' in body) { patch.reagenda_solicitada = ''; patch.reagenda_motivo = ''; }
  }
  let v = await s.updateVisita(req.params.id, patch);
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });

  // Al completar: enviar la orden firmada al correo del cliente (si hay correo)
  let email_result = null;
  if (patch.estado === 'Completada' && v.email && !v.orden_enviada) {
    email_result = await sendOrden(v, COMPANY);
    if (email_result.ok) {
      v = await s.updateVisita(req.params.id, { orden_enviada: new Date().toISOString() });
    }
  }
  res.json({ ...v, _email: email_result });
}));

// Reenviar la orden al cliente (coordinación)
api.post('/visitas/:id/enviar-orden', auth, soloCoordinador, wrap(async (req, res) => {
  const s = await getStore();
  const v = (await s.listVisitas()).find((x) => x._uid === String(req.params.id));
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });
  const r = await sendOrden(v, COMPANY);
  if (r.ok) await s.updateVisita(req.params.id, { orden_enviada: new Date().toISOString() });
  res.json(r);
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

api.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', api);

// --- Estáticos (SPA) ---
app.use(express.static(__dirname, { etag: true, lastModified: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

getStore()
  .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`WIFIRED Agenda — servidor en http://0.0.0.0:${PORT}`)))
  .catch((e) => { console.error('Fallo al iniciar:', e); process.exit(1); });
