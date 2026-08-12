// ============================================================
// WIFIRED · Servidor Express — API REST + SPA estática
// ============================================================
const express = require('express');
const path = require('path');
const { getStore } = require('./db.js');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '1mb' }));

// Pequeño helper para envolver handlers async
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ---------------- API ----------------
const api = express.Router();

// Bootstrap: todo lo que la app necesita al cargar
api.get('/bootstrap', wrap(async (req, res) => {
  const s = await getStore();
  const [visitas, tecnicos, config] = await Promise.all([s.listVisitas(), s.listTecnicos(), s.getConfig()]);
  res.json({ visitas, tecnicos, config });
}));

// --- Visitas ---
api.get('/visitas', wrap(async (req, res) => res.json(await (await getStore()).listVisitas())));
api.post('/visitas', wrap(async (req, res) => {
  const s = await getStore();
  if (!req.body || !req.body.cliente) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
  res.status(201).json(await s.addVisita(req.body));
}));
api.put('/visitas/:id', wrap(async (req, res) => {
  const v = await (await getStore()).updateVisita(req.params.id, req.body || {});
  if (!v) return res.status(404).json({ error: 'Visita no encontrada' });
  res.json(v);
}));
api.delete('/visitas/:id', wrap(async (req, res) => {
  await (await getStore()).deleteVisita(req.params.id);
  res.json({ ok: true });
}));

// --- Técnicos ---
api.get('/tecnicos', wrap(async (req, res) => res.json(await (await getStore()).listTecnicos())));
api.post('/tecnicos', wrap(async (req, res) => {
  const s = await getStore();
  if (!req.body || !req.body.nombre && !req.body.rol) return res.status(400).json({ error: 'Nombre o rol requerido' });
  res.status(201).json(await s.addTecnico(req.body));
}));
api.put('/tecnicos/:id', wrap(async (req, res) => {
  const t = await (await getStore()).updateTecnico(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: 'Técnico no encontrado' });
  res.json(t);
}));
api.delete('/tecnicos/:id', wrap(async (req, res) => {
  await (await getStore()).deleteTecnico(req.params.id);
  res.json({ ok: true });
}));

api.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', api);

// ---------------- Estáticos (SPA) ----------------
app.use(express.static(__dirname, {
  extensions: false,
  setHeaders: (res, p) => {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Fallback a index.html para navegación directa
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ---------------- Arranque ----------------
getStore()
  .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`WIFIRED Agenda — servidor en http://0.0.0.0:${PORT}`)))
  .catch((e) => { console.error('Fallo al iniciar:', e); process.exit(1); });
