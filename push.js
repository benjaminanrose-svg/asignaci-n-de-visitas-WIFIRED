// ============================================================
// WIFIRED · Notificaciones push (Web Push / VAPID)
// Las claves VAPID se generan una vez y se guardan en la BD.
// ============================================================
const webpush = require('web-push');
const { getStore } = require('./db.js');

let vapid = null;
async function ensureVapid() {
  if (vapid) return vapid;
  const s = await getStore();
  let pub = await s.getSetting('vapid_public');
  let priv = await s.getSetting('vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey; priv = keys.privateKey;
    await s.setSetting('vapid_public', pub);
    await s.setSetting('vapid_private', priv);
  }
  webpush.setVapidDetails('mailto:' + (process.env.MAIL_FROM || 'soporte@wifired.cl'), pub, priv);
  vapid = { publicKey: pub, privateKey: priv };
  return vapid;
}

async function publicKey() { return (await ensureVapid()).publicKey; }

async function saveSubscription(userId, sub) {
  if (!sub || !sub.endpoint) return;
  const s = await getStore();
  await s.savePushSub(userId, sub);
}

/** Envía una notificación push a todos los dispositivos de un técnico */
async function notifyTecnicoById(tecnicoId, payload) {
  if (!tecnicoId) return;
  try { await ensureVapid(); } catch (e) { return; }
  const s = await getStore();
  const subs = await s.listPushSubsByTecnicoId(tecnicoId);
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { try { await s.removePushSubByEndpoint(sub.endpoint); } catch (_) {} }
    }
  }));
}

module.exports = { ensureVapid, publicKey, saveSubscription, notifyTecnicoById };
