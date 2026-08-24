// ============================================================
// WIFIRED · Control del router MikroTik (cortar / activar internet)
// Usa la REST API de RouterOS v7 sobre HTTPS. Sin dependencias externas.
// Credenciales SOLO por variables de entorno (nunca en el repo):
//   MIKROTIK_HOST  → IP o dominio del router (ej: 190.x.x.x)
//   MIKROTIK_USER  → usuario API del router (ej: wifired-api)
//   MIKROTIK_PASS  → clave de ese usuario
//   MIKROTIK_PORT  → puerto HTTPS de la REST API (por defecto 443)
// El router debe tener RouterOS v7 con el servicio "www-ssl" activo
// y ser alcanzable desde el servidor de la app.
// ============================================================
const https = require('https');

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

/** Llama a la REST API del router. path ej: '/ppp/secret' */
function req(method, path, body) {
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
        } else {
          reject(new Error(`El router respondió ${res.statusCode}: ${buf || res.statusMessage}`));
        }
      });
    });
    r.on('error', (e) => reject(new Error(`No se pudo conectar al router (${e.code || e.message})`)));
    r.setTimeout(10000, () => r.destroy(new Error('El router no respondió (timeout)')));
    if (data) r.write(data);
    r.end();
  });
}

/** Busca la cuenta PPPoE por nombre de usuario. */
async function findSecret(user) {
  const list = await req('GET', '/ppp/secret');
  if (!Array.isArray(list)) return null;
  return list.find((s) => (s.name || '') === user) || null;
}

/** Habilita o deshabilita la cuenta PPPoE y (al cortar) cierra la sesión activa. */
async function setEnabled(user, enabled) {
  if (!user) throw new Error('El servicio no tiene usuario PPPoE configurado');
  const s = await findSecret(user);
  if (!s) throw new Error(`No existe el usuario PPPoE "${user}" en el router`);
  await req('PATCH', `/ppp/secret/${encodeURIComponent(s['.id'])}`, { disabled: enabled ? 'false' : 'true' });
  if (!enabled) {
    // cerrar la sesión activa para que el corte sea inmediato
    const act = await req('GET', '/ppp/active');
    if (Array.isArray(act)) {
      for (const a of act) {
        if ((a.name || '') === user) { try { await req('DELETE', `/ppp/active/${encodeURIComponent(a['.id'])}`); } catch (e) { /* ya se desconectó */ } }
      }
    }
  }
  return true;
}

/** Prueba de conexión: cuenta las cuentas PPPoE (verifica credenciales/alcance). */
async function ping() {
  const list = await req('GET', '/ppp/secret');
  return { ok: true, cuentas: Array.isArray(list) ? list.length : 0 };
}

module.exports = {
  configured,
  cortar: (user) => setEnabled(user, false),
  activar: (user) => setEnabled(user, true),
  ping,
  findSecret,
};
