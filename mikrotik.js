// ============================================================
// WIFIRED · Control del router MikroTik (cortar / activar internet)
// Funciona con RouterOS v7 (REST API sobre HTTPS) y v6/v7 (API binaria).
// Credenciales SOLO por variables de entorno (nunca en el repo):
//   MIKROTIK_HOST  → IP o dominio del router (ej: 10.10.0.1 en la VPN)
//   MIKROTIK_USER  → usuario API del router (ej: wifired-api)
//   MIKROTIK_PASS  → clave de ese usuario
//   MIKROTIK_PORT  → puerto:
//        443  → REST API (RouterOS v7, servicio www-ssl)   [por defecto]
//        8728 → API binaria (v6 y v7)
//        8729 → API binaria sobre TLS (v6 y v7, api-ssl)
//   MIKROTIK_MODE  → 'rest' o 'api' (opcional; si no, se deduce del puerto)
//   MIKROTIK_TLS   → 'true' para forzar TLS en la API binaria
// ============================================================
const https = require('https');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function cfg() {
  return {
    host: process.env.MIKROTIK_HOST || '',
    user: process.env.MIKROTIK_USER || '',
    pass: process.env.MIKROTIK_PASS || '',
    port: process.env.MIKROTIK_PORT || '443',
  };
}

/** ¿Están cargadas las credenciales del router? */
function configured() { const c = cfg(); return !!(c.host && c.user && c.pass); }

/** Decide el modo: 'rest' (v7 HTTPS) o 'api' (binaria v6/v7). */
function mode() {
  const m = (process.env.MIKROTIK_MODE || '').toLowerCase();
  if (m === 'rest' || m === 'api') return m;
  const p = cfg().port;
  return (p === '8728' || p === '8729') ? 'api' : 'rest';
}

// ============================================================
//  Transporte REST (RouterOS v7)
// ============================================================
function restReq(method, path, body) {
  const c = cfg();
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const r = https.request({
      host: c.host, port: c.port, path: '/rest' + path, method,
      rejectUnauthorized: false, // los MikroTik traen certificado autofirmado
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${c.user}:${c.pass}`).toString('base64'),
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(buf ? JSON.parse(buf) : null); } catch (e) { resolve(buf); }
        } else reject(new Error(`El router respondió ${res.statusCode}: ${buf || res.statusMessage}`));
      });
    });
    r.on('error', (e) => reject(new Error(`No se pudo conectar al router (${e.code || e.message})`)));
    r.setTimeout(10000, () => r.destroy(new Error('El router no respondió (timeout)')));
    if (data) r.write(data);
    r.end();
  });
}
async function restSetEnabled(user, enabled) {
  const list = await restReq('GET', '/ppp/secret');
  const s = Array.isArray(list) ? list.find((x) => (x.name || '') === user) : null;
  if (!s) throw new Error(`No existe el usuario PPPoE "${user}" en el router`);
  await restReq('PATCH', `/ppp/secret/${encodeURIComponent(s['.id'])}`, { disabled: enabled ? 'false' : 'true' });
  if (!enabled) {
    const act = await restReq('GET', '/ppp/active');
    if (Array.isArray(act)) for (const a of act) if ((a.name || '') === user) { try { await restReq('DELETE', `/ppp/active/${encodeURIComponent(a['.id'])}`); } catch (e) { /* ya cayó */ } }
  }
  return true;
}
async function restPing() {
  const list = await restReq('GET', '/ppp/secret');
  return { ok: true, cuentas: Array.isArray(list) ? list.length : 0 };
}

// ============================================================
//  Transporte API binaria (RouterOS v6 y v7)
//  Protocolo oficial: palabras con largo prefijado, frase termina en 0.
// ============================================================
function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([((len >> 8) & 0x3f) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([((len >> 16) & 0x1f) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) return Buffer.from([((len >> 24) & 0x0f) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.from([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}
function writeSentence(sock, words) {
  for (const w of words) { const b = Buffer.from(w, 'utf8'); sock.write(encodeLength(b.length)); sock.write(b); }
  sock.write(Buffer.from([0]));
}
/** Lector que arma frases (arreglos de palabras) desde el flujo TCP. */
function makeReader(sock) {
  let buf = Buffer.alloc(0);
  let words = [];
  const sentences = [];
  const waiters = [];
  const deliver = () => { while (sentences.length && waiters.length) waiters.shift()(sentences.shift()); };
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 1) break;
      const b0 = buf[0];
      let len, hdr;
      if ((b0 & 0x80) === 0) { len = b0; hdr = 1; }
      else if ((b0 & 0xc0) === 0x80) { if (buf.length < 2) break; len = ((b0 & 0x3f) << 8) | buf[1]; hdr = 2; }
      else if ((b0 & 0xe0) === 0xc0) { if (buf.length < 3) break; len = ((b0 & 0x1f) << 16) | (buf[1] << 8) | buf[2]; hdr = 3; }
      else if ((b0 & 0xf0) === 0xe0) { if (buf.length < 4) break; len = (((b0 & 0x0f) << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0; hdr = 4; }
      else { if (buf.length < 5) break; len = ((buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4]) >>> 0; hdr = 5; }
      if (buf.length < hdr + len) break;
      const word = buf.slice(hdr, hdr + len).toString('utf8');
      buf = buf.slice(hdr + len);
      if (len === 0) { sentences.push(words); words = []; deliver(); }
      else words.push(word);
    }
  });
  return { next: () => new Promise((res) => { waiters.push(res); deliver(); }) };
}
/** Envía un comando y junta las respuestas hasta !done / !fatal. */
async function apiCmd(reader, sock, words) {
  writeSentence(sock, words);
  const items = []; let trap = null; let doneAttrs = {};
  for (;;) {
    const s = await reader.next();
    const type = s[0] || '';
    const attrs = {};
    for (let i = 1; i < s.length; i++) { const w = s[i]; if (w[0] === '=') { const j = w.indexOf('=', 1); attrs[w.slice(1, j)] = w.slice(j + 1); } }
    if (type === '!re') items.push(attrs);
    else if (type === '!done') { doneAttrs = attrs; break; }
    else if (type === '!trap') trap = attrs.message || 'error del router';
    else if (type === '!fatal') { trap = trap || (s[1] || 'conexión cerrada por el router'); break; }
  }
  return { items, trap, doneAttrs };
}
function apiConnect() {
  const c = cfg();
  const useTls = c.port === '8729' || process.env.MIKROTIK_TLS === 'true';
  return new Promise((resolve, reject) => {
    const sock = useTls
      ? tls.connect({ host: c.host, port: +c.port, rejectUnauthorized: false }, () => resolve(sock))
      : net.connect({ host: c.host, port: +c.port }, () => resolve(sock));
    sock.once('error', (e) => reject(new Error(`No se pudo conectar al router (${e.code || e.message})`)));
    sock.setTimeout(10000, () => sock.destroy(new Error('El router no respondió (timeout)')));
  });
}
async function apiLogin(reader, sock, user, pass) {
  // Método moderno (RouterOS 6.43+ y v7): usuario y clave en texto.
  let r = await apiCmd(reader, sock, ['/login', '=name=' + user, '=password=' + pass]);
  if (r.trap) throw new Error('Login rechazado por el router: ' + r.trap);
  // Método antiguo (< 6.43): responde con challenge en =ret= y hay que firmar en MD5.
  if (r.doneAttrs && r.doneAttrs.ret) {
    const chal = Buffer.from(r.doneAttrs.ret, 'hex');
    const md5 = crypto.createHash('md5').update(Buffer.concat([Buffer.from([0]), Buffer.from(pass), chal])).digest('hex');
    r = await apiCmd(reader, sock, ['/login', '=name=' + user, '=response=00' + md5]);
    if (r.trap) throw new Error('Login rechazado por el router: ' + r.trap);
  }
  return true;
}
async function apiRun(fn) {
  const c = cfg();
  const sock = await apiConnect();
  const reader = makeReader(sock);
  try { await apiLogin(reader, sock, c.user, c.pass); return await fn(reader, sock); }
  finally { try { sock.end(); sock.destroy(); } catch (e) { /* nada */ } }
}
async function apiSetEnabled(user, enabled) {
  return apiRun(async (reader, sock) => {
    const r = await apiCmd(reader, sock, ['/ppp/secret/print', '=.proplist=.id,name', '?name=' + user]);
    if (r.trap) throw new Error(r.trap);
    const sec = r.items[0];
    if (!sec) throw new Error(`No existe el usuario PPPoE "${user}" en el router`);
    const set = await apiCmd(reader, sock, ['/ppp/secret/set', '=.id=' + sec['.id'], '=disabled=' + (enabled ? 'no' : 'yes')]);
    if (set.trap) throw new Error(set.trap);
    if (!enabled) {
      const act = await apiCmd(reader, sock, ['/ppp/active/print', '=.proplist=.id,name', '?name=' + user]);
      for (const a of act.items) { try { await apiCmd(reader, sock, ['/ppp/active/remove', '=.id=' + a['.id']]); } catch (e) { /* ya cayó */ } }
    }
    return true;
  });
}
async function apiPing() {
  return apiRun(async (reader, sock) => {
    const r = await apiCmd(reader, sock, ['/ppp/secret/print', '=.proplist=.id']);
    if (r.trap) throw new Error(r.trap);
    return { ok: true, cuentas: r.items.length };
  });
}

// ============================================================
//  API pública del módulo (elige el transporte según el modo)
// ============================================================
async function setEnabled(user, enabled) {
  if (!user) throw new Error('El servicio no tiene usuario PPPoE configurado');
  return mode() === 'api' ? apiSetEnabled(user, enabled) : restSetEnabled(user, enabled);
}
async function ping() { return mode() === 'api' ? apiPing() : restPing(); }

module.exports = {
  configured,
  mode,
  cortar: (user) => setEnabled(user, false),
  activar: (user) => setEnabled(user, true),
  ping,
};
