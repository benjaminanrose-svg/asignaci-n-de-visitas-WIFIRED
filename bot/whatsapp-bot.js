// ============================================================
// WIFIRED · Bot de WhatsApp (gratis, sobre WhatsApp Web)
// Atiende a los clientes con un menú y crea tickets en WIFIRED.
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

const API_URL = (process.env.API_URL || 'http://localhost:8081').replace(/\/+$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';
const EMPRESA = process.env.EMPRESA || 'TELECOMUNICACIONES WIFIRED';

if (!BOT_API_KEY) {
  console.error('❌ Falta la variable BOT_API_KEY (debe ser la misma que configuraste en la app).');
  process.exit(1);
}

// ---------- Textos ----------
const MENU =
`¡Hola! 👋 Bienvenido a *${EMPRESA}*.
Soy el asistente virtual. ¿En qué te ayudo hoy?
Responde con el *número* de la opción:

1️⃣ Soporte técnico (internet lento, cortes, sin señal)
2️⃣ Planes, precios y contratación
3️⃣ Pagos y facturación
4️⃣ Agendar o consultar una visita
5️⃣ Hablar con un ejecutivo 🧑‍💼

_Escribe *menú* en cualquier momento para volver aquí._`;

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
      { campo: 'nombre', pregunta: '📅 ¡Claro! ¿Cuál es tu *nombre*?' },
      { campo: 'mensaje', pregunta: 'Cuéntame si quieres *agendar* una visita o *consultar* una ya agendada, e incluye tu *dirección*.' },
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

// ---------- Cliente WhatsApp ----------
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'wifired' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
});

client.on('qr', (qr) => {
  console.log('\n📲 Escanea este código QR con el WhatsApp de la empresa:');
  console.log('   (WhatsApp → Dispositivos vinculados → Vincular un dispositivo)\n');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => console.log('🔐 Sesión autenticada.'));
client.on('ready', () => console.log(`✅ Bot conectado y escuchando. API: ${API_URL}`));
client.on('auth_failure', (m) => console.error('❌ Fallo de autenticación:', m));
client.on('disconnected', (r) => console.warn('⚠️ Desconectado:', r));

async function botSend(id, text) {
  lastBotSend.set(id, Date.now());
  try { await client.sendMessage(id, text); } catch (e) { console.error('Error al enviar:', e.message); }
}

async function crearTicket(payload) {
  const r = await fetch(API_URL + '/api/bot/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-key': BOT_API_KEY },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('API ' + r.status + ' ' + (await r.text().catch(() => '')));
  return r.json();
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
      return botSend(id, MENU);
    }

    let sess = sessions.get(id);
    if (sess && now - sess.ts > SESSION_TTL) { sessions.delete(id); sess = null; }

    // Sin flujo activo: interpretar selección del menú
    if (!sess) {
      const opt = (text.match(/^([1-5])/) || [])[1];
      if (!opt) return botSend(id, MENU);
      return startFlow(id, opt, msg);
    }

    // En medio de un flujo: procesar la respuesta al paso actual
    return handleStep(id, sess, msg);
  } catch (e) { console.error('Error procesando mensaje:', e); }
});

async function startFlow(id, opt, msg) {
  // Opción 5: pasar a un ejecutivo (silencia el bot y crea ticket)
  if (opt === '5') {
    const nombre = (msg._data && msg._data.notifyName) || '';
    try { await crearTicket({ categoria: 'Ejecutivo', nombre, telefono: id.replace('@c.us', ''), mensaje: 'El cliente solicitó hablar con un ejecutivo.' }); } catch (e) { console.error(e.message); }
    handoff.set(id, Date.now() + HANDOFF_TTL);
    resetSession(id);
    return botSend(id, '🧑‍💼 ¡Con gusto! Un ejecutivo continuará esta conversación contigo lo antes posible.\n\n_Dejé de responder automáticamente para que puedas hablar con la persona._');
  }
  const flow = FLOWS[opt];
  if (!flow) return botSend(id, MENU);
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

console.log('Iniciando bot de WhatsApp WIFIRED…');
client.initialize();
