// ============================================================
// WIFIRED · Capa de datos
// Usa PostgreSQL si existe DATABASE_URL; si no, un store en
// memoria (sembrado) para desarrollo/demo local sin base de datos.
// Interfaz única y asíncrona para ambos modos.
// ============================================================
const fs = require('fs');
const path = require('path');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed.json'), 'utf8'));

const CONFIG = {
  bloques: SEED.bloques,
  tipos: SEED.tipos,
  estados: SEED.estados,
};

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

const VISIT_FIELDS = ['estado', 'tipo', 'fecha', 'bloque', 'cliente', 'rut', 'telefono', 'direccion', 'gps', 'detalle', 'tecnico'];

// ============================================================
//  Store en memoria
// ============================================================
function memoryStore() {
  let tecnicos = SEED.tecnicos.map((full, i) => {
    const { rol, nombre } = splitTecnico(full);
    return { id: i + 1, rol, nombre, telefono: '', activo: true };
  });
  let tSeq = tecnicos.length;
  let visitas = SEED.visitas.map((v, i) => ({ id: i + 1, ot: v.id, ...pick(v) }));
  let vSeq = visitas.length;

  function pick(v) {
    const o = {};
    VISIT_FIELDS.forEach((f) => (o[f] = v[f] || ''));
    return o;
  }
  const outT = (t) => ({ ...t, display: displayTecnico(t.rol, t.nombre) });
  const outV = (v) => ({ _uid: String(v.id), id: v.ot, ...pick(v) });

  return {
    async init() {},
    async getConfig() { return CONFIG; },
    async listTecnicos() { return tecnicos.map(outT); },
    async addTecnico(d) {
      const t = { id: ++tSeq, rol: d.rol || 'Técnico', nombre: (d.nombre || '').trim(), telefono: d.telefono || '', activo: d.activo !== false };
      tecnicos.push(t); return outT(t);
    },
    async updateTecnico(id, patch) {
      const t = tecnicos.find((x) => x.id == id); if (!t) return null;
      ['rol', 'nombre', 'telefono', 'activo'].forEach((k) => { if (k in patch) t[k] = patch[k]; });
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
  };
}

// ============================================================
//  Store PostgreSQL
// ============================================================
function pgStore(url) {
  const { Pool } = require('pg');
  const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl });

  const outT = (r) => ({ id: r.id, rol: r.rol, nombre: r.nombre, telefono: r.telefono || '', activo: r.activo, display: displayTecnico(r.rol, r.nombre) });
  const outV = (r) => ({
    _uid: String(r.id), id: r.ot,
    estado: r.estado || '', tipo: r.tipo || '', fecha: r.fecha || '', bloque: r.bloque || '',
    cliente: r.cliente || '', rut: r.rut || '', telefono: r.telefono || '', direccion: r.direccion || '',
    gps: r.gps || '', detalle: r.detalle || '', tecnico: r.tecnico || '',
  });

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
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );`);

      // Siembra inicial sólo si las tablas están vacías
      const tc = await pool.query('SELECT COUNT(*)::int AS n FROM tecnicos');
      if (tc.rows[0].n === 0) {
        for (const full of SEED.tecnicos) {
          const { rol, nombre } = splitTecnico(full);
          await pool.query('INSERT INTO tecnicos (rol, nombre) VALUES ($1,$2)', [rol, nombre]);
        }
      }
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
    },
    async getConfig() { return CONFIG; },
    async listTecnicos() {
      const { rows } = await pool.query('SELECT * FROM tecnicos ORDER BY activo DESC, id ASC');
      return rows.map(outT);
    },
    async addTecnico(d) {
      const { rows } = await pool.query(
        'INSERT INTO tecnicos (rol, nombre, telefono, activo) VALUES ($1,$2,$3,$4) RETURNING *',
        [d.rol || 'Técnico', (d.nombre || '').trim(), d.telefono || '', d.activo !== false]);
      return outT(rows[0]);
    },
    async updateTecnico(id, patch) {
      const cols = [], vals = []; let i = 1;
      ['rol', 'nombre', 'telefono', 'activo'].forEach((k) => {
        if (k in patch) { cols.push(`${k}=$${i++}`); vals.push(patch[k]); }
      });
      if (!cols.length) return null;
      vals.push(id);
      const { rows } = await pool.query(`UPDATE tecnicos SET ${cols.join(', ')} WHERE id=$${i} RETURNING *`, vals);
      return rows[0] ? outT(rows[0]) : null;
    },
    async deleteTecnico(id) { await pool.query('DELETE FROM tecnicos WHERE id=$1', [id]); },
    async listVisitas() {
      const { rows } = await pool.query('SELECT * FROM visitas ORDER BY id DESC');
      return rows.map(outV);
    },
    async addVisita(d) {
      const { rows: ex } = await pool.query('SELECT ot FROM visitas');
      const ot = nextOt(ex.map((r) => r.ot));
      const { rows } = await pool.query(
        `INSERT INTO visitas (ot,estado,tipo,fecha,bloque,cliente,rut,telefono,direccion,gps,detalle,tecnico)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [ot, d.estado || 'Pendiente', d.tipo || '', d.fecha || '', d.bloque || '', d.cliente || '', d.rut || '',
         d.telefono || '', d.direccion || '', d.gps || '', d.detalle || '', d.tecnico || '']);
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
