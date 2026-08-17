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
  evidencia_email: '',
  empresa: {
    nombre: 'TELECOMUNICACIONES WIFIRED LTDA',
    direccion: 'Av. Libertad, esquina Silva Chávez #701, Melipilla',
    fonos: ['569 89798503', '569 99967675'],
    email: 'Soporte@wifired.cl',
    autoriza: 'Martin Ballesteros Escarate',
  },
};
const CONFIG = DEFAULT_CONFIG; // compat

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
    evidencia_email: typeof stored.evidencia_email === 'string' ? stored.evidencia_email.trim() : '',
    empresa: { ...DEFAULT_CONFIG.empresa, ...(stored.empresa && typeof stored.empresa === 'object' ? stored.empresa : {}) },
  };
}
/** Guarda un parche de configuración (fusiona sobre lo actual) */
async function saveConfigWith(getSetting, setSetting, patch) {
  const cur = await loadConfig(getSetting);
  const next = { ...cur, ...(patch || {}) };
  if (patch && patch.empresa) next.empresa = { ...cur.empresa, ...patch.empresa };
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

function nextOt(existing) {
  const nums = existing
    .map((ot) => parseInt((String(ot).match(/(\d+)\s*$/) || [])[1] || '0', 10))
    .filter((n) => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `OT-MEL-2026-${String(n).padStart(3, '0')}`;
}

const VISIT_FIELDS = ['estado', 'tipo', 'fecha', 'bloque', 'cliente', 'rut', 'telefono', 'direccion', 'gps', 'detalle', 'tecnico', 'asignado_por', 'reagenda_solicitada', 'reagenda_motivo', 'prioridad', 'evidencias', 'email', 'firma_cliente', 'firma_tecnico', 'orden_enviada', 'nodo', 'historial', 'validada'];

/** evidencias / historial se guardan como JSON (texto) y se exponen como arreglo */
function parseEv(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

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
  const uniqUser = (base, exceptId) => { let u = base || 'tecnico', b = u, i = 2; while (users.some((x) => x.username === u && x.id !== exceptId)) u = `${b}${i++}`; return u; };

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
    async addVisita(d) {
      const ot = nextOt(visitas.map((x) => x.ot));
      const v = { id: ++vSeq, ot, ...pick(d) };
      if (!v.estado) v.estado = 'Pendiente';
      visitas.unshift(v); return outV(v);
    },
    async updateVisita(id, patch) {
      const v = visitas.find((x) => x.id == id); if (!v) return null;
      VISIT_FIELDS.forEach((k) => { if (k in patch) v[k] = patch[k]; });
      return outV(v);
    },
    async deleteVisita(id) { visitas = visitas.filter((x) => x.id != id); },
    async setPin(id, pin) { const v = visitas.find((x) => x.id == id); if (v) { v.pin = pin; v.pin_ts = pin ? Date.now() : 0; } },
    async getPin(id) { const v = visitas.find((x) => x.id == id); return v ? { pin: v.pin || '', ts: v.pin_ts || 0 } : { pin: '', ts: 0 }; },
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
  });
  const outU = (r) => r ? { id: r.id, username: r.username, pass: r.pass, rol: r.rol, nombre: r.nombre, tecnico_id: r.tecnico_id } : null;
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
    async savePushSub(userId, sub) { await pool.query('INSERT INTO push_subs (user_id,endpoint,sub) VALUES ($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET sub=$3, user_id=$1', [userId, sub.endpoint, JSON.stringify(sub)]); },
    async listPushSubsByTecnicoId(tid) { const { rows } = await pool.query('SELECT ps.sub FROM push_subs ps JOIN usuarios u ON u.id=ps.user_id WHERE u.tecnico_id=$1', [tid]); return rows.map((r) => { try { return JSON.parse(r.sub); } catch (e) { return null; } }).filter(Boolean); },
    async removePushSubByEndpoint(ep) { await pool.query('DELETE FROM push_subs WHERE endpoint=$1', [ep]); },
    async listVisitas() {
      const { rows } = await pool.query('SELECT * FROM visitas ORDER BY id DESC');
      return rows.map(outV);
    },
    async addVisita(d) {
      const { rows: ex } = await pool.query('SELECT ot FROM visitas');
      const ot = nextOt(ex.map((r) => r.ot));
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
      if (!cols.length) return null;
      cols.push(`updated_at=now()`);
      vals.push(id);
      const { rows } = await pool.query(`UPDATE visitas SET ${cols.join(', ')} WHERE id=$${i} RETURNING *`, vals);
      return rows[0] ? outV(rows[0]) : null;
    },
    async deleteVisita(id) { await pool.query('DELETE FROM visitas WHERE id=$1', [id]); },
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
