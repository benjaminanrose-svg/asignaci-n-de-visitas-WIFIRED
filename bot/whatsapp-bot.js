// ============================================================
// WIFIRED · Bot de WhatsApp (gratis, sobre WhatsApp Web)
// Atiende a los clientes con un menú y crea tickets en WIFIRED.
// Automatiza: envío de planes, consulta de visita y horario.
// Corre en el mismo servidor y habla con la app por su API local.
//
// Requisitos: Node 18+ (usa fetch nativo), whatsapp-web.js, qrcode-terminal.
// Variables de entorno:
//   BOT_API_KEY  (obligatoria) — la misma clave configurada en la app.
//   API_URL      (opcional)    — URL local de la app. Por defecto http://localhost:8081
//   EMPRESA      (opcional)    — nombre que saluda el bot.
// ============================================================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

/** Busca el navegador Chromium del sistema (evita descargar uno aparte) */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/snap/bin/chromium']) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return undefined; // si no hay, whatsapp-web.js usa su navegador incluido
}

const API_URL = (process.env.API_URL || 'http://localhost:8081').replace(/\/+$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';
const EMPRESA = process.env.EMPRESA || 'TELECOMUNICACIONES WIFIRED';

if (!BOT_API_KEY) {
  console.error('❌ Falta la variable BOT_API_KEY (debe ser la misma que configuraste en la app).');
  process.exit(1);
}

// ---------- Config del bot (se lee desde la app y se refresca sola) ----------
let botCfg = {
  activo: true,
  saludo: 'Soy el asistente virtual. ¿En qué te ayudo hoy?',
  planes: '',
  horario: { activo: false, desde: '09:00', hasta: '19:00', mensaje: '' },
};

async function api(path, opts = {}) {
  const r = await fetch(API_URL + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-bot-key': BOT_API_KEY, ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error('API ' + r.status + ' ' + (await r.text().catch(() => '')));
  return r.status === 204 ? null : r.json();
}

async function loadBotConfig() {
  try {
    const c = await api('/api/bot/config');
    if (c && typeof c === 'object') botCfg = { ...botCfg, ...c, horario: { ...botCfg.horario, ...(c.horario || {}) } };
  } catch (e) { /* se reintenta en el próximo ciclo */ }
}

// ---------- Textos ----------
function menuText() {
  return `¡Hola! 👋 Bienvenido a *${EMPRESA}*.
${botCfg.saludo}
Responde con el *número* de la opción:

1️⃣ Soporte técnico (internet lento, cortes, sin señal)
2️⃣ Planes, precios y contratación
3️⃣ Pagos y facturación
4️⃣ Agendar o consultar una visita
5️⃣ Hablar con un ejecutivo 🧑‍💼

_Escribe *menú* en cualquier momento para volver aquí._`;
}
const CIERRE = '\n\n_Escribe *menú* si necesitas algo más._ 🙌';

// Flujos guiados por categoría (preguntas paso a paso)
const FLOWS = {
  '1': {
    categoria: 'Soporte',
    pasos: [
      { campo: 'nombre', pregunta: 'Lamento el problema con tu servicio. 🛠️\n\nPara ayudarte, ¿cuál es tu *nombre completo*?' },
      { campo: 'mensaje', pregunta: 'Gracias. Ahora cuéntame *qué está pasando* (ej: sin internet desde ayer, anda lento, sin señal…).' },
    ],
    confirma: (n) => `✅ ¡Listo! Registramos tu solicitud de *soporte* con el N° *${n}*.\nUn técnico revisará tu caso a la brevedad.`,
  },
  '2': {
    categoria: 'Contratación',
    pasos: [
      { campo: 'ubicacion', esUbicacion: true, pregunta: '¡Genial! 📶 Primero revisemos si tenemos *cobertura* en tu sector.\n\nPor favor compárteme tu *ubicación*:\ntoca el clip 📎 → *Ubicación* → *Enviar tu ubicación actual*.\n\n_Si prefieres, también puedes escribirme tu dirección exacta (calle, número y sector)._' },
      { campo: 'nombre', pregunta: '¡Perfecto! Por último, ¿cuál es tu *nombre*?' },
    ],
    confirma: (n) => `✅ ¡Recibido! Estamos revisando la *factibilidad* en tu sector (N° *${n}*).\nTe confirmamos pronto si podemos llevarte internet y te enviamos los planes. 📶`,
  },
  '3': {
    categoria: 'Pagos',
    pasos: [
      { campo: 'nombre', pregunta: '💳 Con gusto. ¿Cuál es el *nombre o RUT del titular*?' },
      { campo: 'mensaje', pregunta: '¿En qué te ayudamos? (ej: quiero pagar, consultar mi deuda, enviar comprobante).' },
    ],
    confirma: (n) => `✅ ¡Gracias! Tu consulta de *pagos* quedó registrada con el N° *${n}*.\nTe contactaremos a la brevedad. 💳`,
  },
  '4': {
    categoria: 'Visita',
    pasos: [
      { campo: 'mensaje', pregunta: '¿Quieres *agendar* una nueva visita o *consultar* algo puntual? Cuéntame, e incluye tu *dirección* si es una visita nueva.' },
    ],
    confirma: (n) => `✅ ¡Listo! Tu solicitud quedó registrada con el N° *${n}*.\nCoordinación te contactará para confirmar. 📅`,
  },
};

// ---------- Estado en memoria ----------
const sessions = new Map();   // chatId -> { opt, idx, data, ts }
const handoff = new Map();    // chatId -> timestamp hasta el cual el bot NO responde
const lastBotSend = new Map();// chatId -> timestamp del último envío del bot
const SESSION_TTL = 10 * 60 * 1000;      // 10 min sin actividad → se reinicia el flujo
const HANDOFF_TTL = 3 * 60 * 60 * 1000;  // 3 h de silencio cuando entra un humano

function resetSession(id) { sessions.delete(id); }

// ---------- Horario de atención ----------
function horaChile() {
  return new Date().toLocaleString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
}
function fueraDeHorario() {
  const h = botCfg.horario || {};
  if (!h.activo) return false;
  const now = horaChile();
  const d = h.desde || '00:00', u = h.hasta || '23:59';
  return !(now >= d && now <= u);
}

// ---------- Cliente WhatsApp ----------
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'wifired' }),
  puppeteer: { headless: true, executablePath: findChromium(), args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
});

client.on('qr', (qr) => {
  console.log('\n📲 Escanea este código QR con el WhatsApp de la empresa:');
  console.log('   (WhatsApp → Dispositivos vinculados → Vincular un dispositivo)\n');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => console.log('🔐 Sesión autenticada.'));
client.on('ready', async () => { await loadBotConfig(); console.log(`✅ Bot conectado y escuchando. API: ${API_URL}`); });
client.on('auth_failure', (m) => console.error('❌ Fallo de autenticación:', m));
client.on('disconnected', (r) => console.warn('⚠️ Desconectado:', r));

async function botSend(id, text) {
  lastBotSend.set(id, Date.now());
  try { await client.sendMessage(id, text); } catch (e) { console.error('Error al enviar:', e.message); }
}

function crearTicket(payload) { return api('/api/bot/ticket', { method: 'POST', body: JSON.stringify(payload) }); }

/** Convierte un teléfono (dígitos) al id de chat de WhatsApp */
function toChatId(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('56')) { if (d.length === 9) d = '56' + d; else if (d.length === 8) d = '569' + d; else d = '56' + d; }
  return d + '@c.us';
}

// Cuando un humano (la coordinación) responde manualmente desde el WhatsApp,
// el bot se calla en ese chat por un rato para no interrumpir.
client.on('message_create', (msg) => {
  if (!msg.fromMe) return;
  const to = msg.to;
  if (!to || !to.endsWith('@c.us')) return;
  const last = lastBotSend.get(to) || 0;
  if (Date.now() - last < 8000) return; // ese mensaje lo envió el propio bot
  handoff.set(to, Date.now() + HANDOFF_TTL);
  resetSession(to);
});

client.on('message', async (msg) => {
  try {
    const id = msg.from;
    if (!id.endsWith('@c.us')) return;         // ignora grupos y difusiones
    if (msg.fromMe) return;
    if (botCfg.activo === false) return;       // bot apagado desde la app
    const now = Date.now();

    // Silencio por handoff (humano atendiendo)
    const h = handoff.get(id);
    if (h && now < h) return;
    if (h) handoff.delete(id);

    const text = (msg.body || '').trim();
    const low = text.toLowerCase();

    // Comandos globales para volver al menú
    if (['menu', 'menú', 'hola', 'inicio', 'buenas', 'empezar'].includes(low)) {
      resetSession(id);
      if (fueraDeHorario() && botCfg.horario.mensaje) await botSend(id, botCfg.horario.mensaje);
      return botSend(id, menuText());
    }

    let sess = sessions.get(id);
    if (sess && now - sess.ts > SESSION_TTL) { sessions.delete(id); sess = null; }

    // Sin flujo activo: interpretar selección del menú
    if (!sess) {
      const opt = (text.match(/^([1-5])/) || [])[1];
      if (!opt) {
        if (fueraDeHorario() && botCfg.horario.mensaje) await botSend(id, botCfg.horario.mensaje);
        return botSend(id, menuText());
      }
      return startFlow(id, opt, msg);
    }

    // En medio de un flujo: procesar la respuesta al paso actual
    return handleStep(id, sess, msg);
  } catch (e) { console.error('Error procesando mensaje:', e); }
});

async function startFlow(id, opt, msg) {
  const nombre = (msg._data && msg._data.notifyName) || '';
  const telefono = id.replace('@c.us', '');

  // Opción 5: pasar a un ejecutivo (silencia el bot y crea ticket)
  if (opt === '5') {
    try { await crearTicket({ categoria: 'Ejecutivo', nombre, telefono, mensaje: 'El cliente solicitó hablar con un ejecutivo.' }); } catch (e) { console.error(e.message); }
    handoff.set(id, Date.now() + HANDOFF_TTL);
    resetSession(id);
    return botSend(id, '🧑‍💼 ¡Con gusto! Un ejecutivo continuará esta conversación contigo lo antes posible.\n\n_Dejé de responder automáticamente para que puedas hablar con la persona._');
  }

  // Opción 4: consultar el estado de la visita del cliente antes de seguir
  if (opt === '4') {
    try {
      const r = await api('/api/bot/visita?telefono=' + encodeURIComponent(telefono));
      if (r && r.found) {
        const t = r.tecnico ? ` con *${r.tecnico}*` : '';
        const f = r.fecha ? ` para el *${r.fecha}*` : '';
        await botSend(id, `📅 Encontré una visita a tu nombre: *${r.estado}*${f}${t}.`);
      }
    } catch (e) { /* si falla la consulta, seguimos igual */ }
  }

  const flow = FLOWS[opt];
  if (!flow) return botSend(id, menuText());
  const sess = { opt, idx: 0, data: {}, ts: Date.now() };
  sessions.set(id, sess);
  return botSend(id, flow.pasos[0].pregunta);
}

async function handleStep(id, sess, msg) {
  const flow = FLOWS[sess.opt];
  const paso = flow.pasos[sess.idx];
  let valor;

  if (paso.esUbicacion) {
    if (msg.type === 'location' && msg.location) {
      valor = `${msg.location.latitude},${msg.location.longitude}`;
    } else {
      valor = (msg.body || '').trim(); // aceptar dirección escrita
    }
    if (!valor) {
      return botSend(id, 'Necesito tu *ubicación* o tu *dirección* para revisar la cobertura.\nToca 📎 → *Ubicación* → *Enviar ubicación actual*, o escríbeme tu dirección exacta.');
    }
  } else {
    valor = (msg.body || '').trim();
    if (!valor) return botSend(id, paso.pregunta);
  }

  sess.data[paso.campo] = valor;
  sess.idx += 1;
  sess.ts = Date.now();

  // ¿Quedan más pasos?
  if (sess.idx < flow.pasos.length) {
    sessions.set(id, sess);
    return botSend(id, flow.pasos[sess.idx].pregunta);
  }

  // Fin del flujo: crear el ticket
  resetSession(id);
  const payload = {
    categoria: flow.categoria,
    nombre: sess.data.nombre || (msg._data && msg._data.notifyName) || '',
    telefono: id.replace('@c.us', ''),
    ubicacion: sess.data.ubicacion || '',
    mensaje: sess.data.mensaje || '',
  };
  try {
    const t = await crearTicket(payload);
    return botSend(id, flow.confirma(t.num) + CIERRE);
  } catch (e) {
    console.error('No se pudo crear el ticket:', e.message);
    return botSend(id, '⚠️ Hubo un problema al registrar tu solicitud. Por favor intenta de nuevo en unos minutos o escribe *menú*.');
  }
}

// ---------- Bandeja de salida: envía los mensajes automáticos (planes, etc.) ----------
let poolingOut = false;
async function pollOutbox() {
  if (poolingOut) return;
  poolingOut = true;
  try {
    const pend = await api('/api/bot/outbox');
    for (const m of pend || []) {
      const chatId = toChatId(m.telefono);
      if (!chatId) { await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' }); continue; }
      await botSend(chatId, m.texto || '');
      await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' });
      console.log(`[BOT] mensaje automático enviado a ${m.telefono}`);
    }
  } catch (e) { /* se reintenta en el próximo ciclo */ }
  finally { poolingOut = false; }
}

console.log('Iniciando bot de WhatsApp WIFIRED…');
client.initialize();
setInterval(loadBotConfig, 60 * 1000);      // refresca la config cada minuto
setInterval(pollOutbox, 12 * 1000);         // envía mensajes automáticos pendientes
