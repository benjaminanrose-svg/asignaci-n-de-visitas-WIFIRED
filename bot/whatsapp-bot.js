// ============================================================
// WIFIRED · Bot de WhatsApp (gratis, motor Baileys — SIN navegador)
// Atiende a los clientes con un menú y crea tickets en WIFIRED.
// Automatiza: envío de planes, consulta de visita y horario.
// Corre en el mismo servidor y habla con la app por su API local.
//
// Se conecta a WhatsApp por su protocolo (WebSocket), sin abrir Chrome:
// mucho más liviano y estable en servidores.
//
// Requisitos: Node 18+ (usa fetch nativo), @whiskeysockets/baileys, qrcode-terminal.
// Variables de entorno:
//   BOT_API_KEY  (obligatoria) — la misma clave configurada en la app.
//   API_URL      (opcional)    — URL local de la app. Por defecto http://localhost:8081
//   EMPRESA      (opcional)    — nombre que saluda el bot.
// ============================================================
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const API_URL = (process.env.API_URL || 'http://localhost:8081').replace(/\/+$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';
const EMPRESA = process.env.EMPRESA || 'TELECOMUNICACIONES WIFIRED';
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_wifired');

// ---------- Modo prueba ----------
// Es el MISMO bot principal, con un interruptor: cuando está activo, IGNORA a todos
// los clientes y solo atiende a quien escriba la palabra clave (por defecto
// "paralelepipedo"). Ideal para probar sin molestar a nadie.
//
// Viene ENCENDIDO por defecto (estamos en pruebas). Para que atienda a TODOS,
// se apaga con la variable MODO_PRUEBA=0 (o false/no/off).
const MODO_PRUEBA = !/^(0|false|no|off)$/i.test(process.env.MODO_PRUEBA || '');
const PALABRA_PRUEBA = (process.env.PALABRA_PRUEBA || 'paralelepipedo').toLowerCase();

if (!BOT_API_KEY) {
  console.error('❌ Falta la variable BOT_API_KEY (debe ser la misma que configuraste en la app).');
  process.exit(1);
}

// Logger silencioso para Baileys (sin depender de pino)
const NOOP = () => {};
const logger = { level: 'silent', trace: NOOP, debug: NOOP, info: NOOP, warn: NOOP, error: NOOP, fatal: NOOP, child: () => logger };

// ---------- Config del bot (se lee desde la app y se refresca sola) ----------
let botCfg = {
  activo: true,
  saludo: 'Soy el asistente virtual. ¿En qué te ayudo hoy?',
  planes: '',
  horario: { activo: false, desde: '09:00', hasta: '19:00', mensaje: '' },
};

async function api(pathname, opts = {}) {
  const r = await fetch(API_URL + pathname, {
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

Para ayudarte, respóndeme con *un solo número* (del 1 al 5) 👇

*1* · Soporte técnico 🛠️ (internet lento, cortes, sin señal)
*2* · Planes y contratar internet 📶
*3* · Pagos y facturación 💳
*4* · Agendar o consultar una visita 📅
*5* · Hablar con una persona 🧑‍💼

_Ejemplo: escribe *2* si quieres contratar._
_Escribe *menú* cuando quieras volver aquí._`;
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
const desbloqueados = new Map(); // (modo prueba) chatId -> ts, chats que dijeron la palabra clave
const esperaPlan = new Map();    // teléfono (dígitos) -> ts límite: le enviamos planes y esperamos su elección
const SESSION_TTL = 10 * 60 * 1000;      // 10 min sin actividad → se reinicia el flujo
const HANDOFF_TTL = 3 * 60 * 60 * 1000;  // 3 h de silencio cuando entra un humano
const PLAN_TTL = 12 * 60 * 60 * 1000;    // 12 h para reconocer la respuesta del cliente a los planes

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

// ---------- Utilidades de mensajes (Baileys) ----------
const SUFIJO = '@s.whatsapp.net';

/** Extrae el texto de un mensaje de Baileys, venga como venga. */
function getText(m) {
  const mm = (m && m.message) || {};
  return (
    mm.conversation ||
    (mm.extendedTextMessage && mm.extendedTextMessage.text) ||
    (mm.imageMessage && mm.imageMessage.caption) ||
    (mm.videoMessage && mm.videoMessage.caption) ||
    (mm.buttonsResponseMessage && mm.buttonsResponseMessage.selectedButtonId) ||
    (mm.listResponseMessage && mm.listResponseMessage.singleSelectReply && mm.listResponseMessage.singleSelectReply.selectedRowId) ||
    ''
  ).trim();
}

/** Devuelve {latitude, longitude} si el mensaje es una ubicación, o null. */
function getLocation(m) {
  const loc = m && m.message && m.message.locationMessage;
  if (!loc) return null;
  return { latitude: loc.degreesLatitude, longitude: loc.degreesLongitude };
}

/** Extrae solo los dígitos de un JID o teléfono (quita @lid, @s.whatsapp.net, :device, etc.) */
function soloDigitos(x) {
  return String(x || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Obtiene el teléfono REAL del cliente. Con el formato nuevo @lid, el remoteJid
 * NO es el número; el número verdadero viene en otro campo de la clave del mensaje
 * (varía según la versión de Baileys) o se resuelve con el mapeo lid→número.
 */
function telefonoReal(m) {
  const k = (m && m.key) || {};
  for (const j of [k.senderPn, k.participantPn, k.remoteJidAlt, k.participantAlt, k.remoteJid, k.participant]) {
    if (j && String(j).endsWith(SUFIJO)) return soloDigitos(j);
  }
  try {
    const map = sock && sock.signalRepository && sock.signalRepository.lidMapping;
    const pn = map && map.getPNForLID && map.getPNForLID(k.remoteJid);
    if (pn) return soloDigitos(pn);
  } catch (e) { /* sin mapeo disponible */ }
  return '';
}

/**
 * Intenta reconocer un teléfono chileno escrito por el cliente en texto libre.
 * Acepta: "9 1234 5678", "+56 9 1234 5678", "56912345678", "912345678".
 * Devuelve los dígitos normalizados (ej: "56912345678") o '' si no parece válido.
 */
function telefonoDeTexto(txt) {
  const d = String(txt || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('569') && d.length === 11) return d;          // 56 9 XXXXXXXX
  if (d.startsWith('9') && d.length === 9) return '56' + d;      // 9 XXXXXXXX
  if (d.startsWith('56') && d.length === 11) return d;           // 56 + 9 dígitos
  if (d.length === 8) return '569' + d;                          // XXXXXXXX (sin el 9)
  return '';
}

/** Paso extra: pedir el teléfono cuando WhatsApp no nos entrega el número real (@lid). */
const PASO_TELEFONO = {
  campo: 'telefono',
  esTelefono: true,
  pregunta: 'Antes de continuar, ¿me confirmas tu *número de teléfono*? 📱\n\nEscríbelo con los 9 dígitos (ej: *9 1234 5678*), así podemos contactarte.',
};

/** Convierte un teléfono (dígitos) al JID de WhatsApp */
function toChatId(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('56')) { if (d.length === 9) d = '56' + d; else if (d.length === 8) d = '569' + d; else d = '56' + d; }
  return d + SUFIJO;
}

// ---------- Conexión Baileys ----------
let sock = null;

async function botSend(id, text) {
  lastBotSend.set(id, Date.now());
  try { await sock.sendMessage(id, { text }); } catch (e) { console.error('Error al enviar:', e.message); }
}

function crearTicket(payload) { return api('/api/bot/ticket', { method: 'POST', body: JSON.stringify(payload) }); }

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ['WIFIRED', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      console.log('\n📲 Escanea este código QR con el WhatsApp de la empresa:');
      console.log('   (WhatsApp → Dispositivos vinculados → Vincular un dispositivo)\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      loadBotConfig();
      const miNumero = (sock.user && sock.user.id ? String(sock.user.id).split(':')[0].split('@')[0] : '') || '(desconocido)';
      console.log(`✅ Bot conectado y escuchando. API: ${API_URL}`);
      console.log(`📱 El bot ES el número: +${miNumero}`);
      if (MODO_PRUEBA) {
        console.log(`🧪 MODO PRUEBA ACTIVO — el bot solo responde a quien escriba: "${PALABRA_PRUEBA}"`);
        console.log('👉 Para PROBARLO: escribe esa palabra a la empresa DESDE OTRO teléfono.');
      } else {
        console.log('👉 Para PROBARLO: escribe "hola" a ese número DESDE OTRO teléfono (un número distinto).');
      }
    }
    if (connection === 'close') {
      const code = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode) || 0;
      const cerroSesion = code === DisconnectReason.loggedOut;
      if (cerroSesion) {
        console.error('❌ Sesión cerrada desde el teléfono. Borra la carpeta "auth_wifired" y vuelve a escanear el QR.');
      } else {
        console.warn(`⚠️ Conexión cerrada (código ${code}). Reintentando en 3 s…`);
        setTimeout(() => start().catch((e) => console.error('Error al reconectar:', e.message)), 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 🔎 Detector: muestra TODO lo que WhatsApp entrega, sin filtrar (diagnóstico).
    for (const mm of messages || []) {
      const k = (mm && mm.key) || {};
      console.log(`🔔 SEÑAL type=${type} de=${k.remoteJid} fromMe=${k.fromMe} descifrado=${!!(mm && mm.message)}`);
    }
    if (type !== 'notify') return; // ignora sincronización de historial
    for (const m of messages) {
      try { await onMessage(m); } catch (e) { console.error('Error procesando mensaje:', e); }
    }
  });
}

async function onMessage(m) {
  if (!m || !m.message) return;
  const id = m.key && m.key.remoteJid;
  if (!id || id === 'status@broadcast') return;
  // Chats individuales: WhatsApp los entrega como @s.whatsapp.net (formato clásico)
  // o como @lid (identidad enlazada, WhatsApp nuevo). Ignoramos grupos (@g.us) y difusiones.
  if (!id.endsWith(SUFIJO) && !id.endsWith('@lid')) return;

  // Mensajes enviados por nosotros mismos: si los escribió un humano
  // (la coordinación) desde el teléfono, el bot se calla un rato.
  if (m.key.fromMe) {
    const last = lastBotSend.get(id) || 0;
    if (Date.now() - last < 8000) return; // lo envió el propio bot
    handoff.set(id, Date.now() + HANDOFF_TTL);
    resetSession(id);
    return;
  }

  if (botCfg.activo === false) return; // bot apagado desde la app

  const info = {
    id,
    body: getText(m),
    location: getLocation(m),
    notifyName: m.pushName || '',
    telefono: telefonoReal(m),
  };
  console.log(`📩 mensaje de ${id} (tel: ${info.telefono || '—'}) · "${(info.body || (info.location ? '[ubicación]' : '')).slice(0, 40)}"`);

  const now = Date.now();

  // Silencio por handoff (humano atendiendo)
  const h = handoff.get(id);
  if (h && now < h) return;
  if (h) handoff.delete(id);

  const text = info.body;
  const low = text.toLowerCase();

  // Modo prueba: solo atendemos a quien escriba la palabra clave; el resto se ignora.
  if (MODO_PRUEBA) {
    if (low === PALABRA_PRUEBA) {
      desbloqueados.set(id, Date.now());
      resetSession(id);
      return botSend(id, '🧪 *Modo prueba activado.* A partir de ahora te atiendo. 👇\n\n' + menuText());
    }
    if (!desbloqueados.has(id)) return; // en pruebas, ignoramos a todos los demás
  }

  // Comandos globales para volver al menú
  if (['menu', 'menú', 'hola', 'inicio', 'buenas', 'empezar'].includes(low)) {
    resetSession(id);
    if (fueraDeHorario() && botCfg.horario.mensaje) await botSend(id, botCfg.horario.mensaje);
    return botSend(id, menuText());
  }

  let sess = sessions.get(id);
  if (sess && now - sess.ts > SESSION_TTL) { sessions.delete(id); sess = null; }

  // Sin flujo activo: primero vemos si está respondiendo a los planes que le enviamos.
  if (!sess) {
    const telDig = soloDigitos(info.telefono);
    if (telDig && esperaPlan.has(telDig)) {
      esperaPlan.delete(telDig);
      try {
        await crearTicket({
          categoria: 'Contratación',
          nombre: info.notifyName || '',
          telefono: info.telefono || telDig,
          mensaje: 'El cliente respondió a los planes: "' + text + '"',
          factibilidad: 'planes_enviados',
        });
      } catch (e) { console.error('No se pudo registrar la elección de plan:', e.message); }
      handoff.set(id, Date.now() + HANDOFF_TTL);
      return botSend(id, '¡Excelente elección! 🎉\nUn ejecutivo te contactará muy pronto para coordinar tu *contratación e instalación*.\n\n_Gracias por preferir ' + EMPRESA + '._ 🙌');
    }

    // Selección del menú: SOLO un número solo (1-5), para no confundir con planes ni teléfonos.
    const mOpt = text.match(/^\s*([1-5])[\s.)\-]*$/);
    const opt = mOpt ? mOpt[1] : null;
    if (!opt) {
      if (fueraDeHorario() && botCfg.horario.mensaje) await botSend(id, botCfg.horario.mensaje);
      return botSend(id, menuText());
    }
    return startFlow(id, opt, info);
  }

  // En medio de un flujo: procesar la respuesta al paso actual
  return handleStep(id, sess, info);
}

async function startFlow(id, opt, info) {
  const nombre = info.notifyName || '';
  // Solo usamos el teléfono si WhatsApp nos lo entregó de verdad.
  // Con el formato @lid, si no lo tenemos, lo pediremos dentro del flujo (NO inventamos un número).
  const telefono = info.telefono || '';

  // Opción 5: pasar a un ejecutivo (silencia el bot y crea ticket)
  if (opt === '5') {
    try { await crearTicket({ categoria: 'Ejecutivo', nombre, telefono, mensaje: 'El cliente solicitó hablar con un ejecutivo.' }); } catch (e) { console.error(e.message); }
    handoff.set(id, Date.now() + HANDOFF_TTL);
    resetSession(id);
    return botSend(id, '🧑‍💼 ¡Con gusto! Un ejecutivo continuará esta conversación contigo lo antes posible.\n\n_Dejé de responder automáticamente para que puedas hablar con la persona._');
  }

  // Opción 4: si conocemos el teléfono real, consultamos su visita antes de seguir
  if (opt === '4' && telefono) {
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
  // Si no tenemos el teléfono real, lo pedimos como primer paso del flujo.
  const pasos = telefono ? flow.pasos.slice() : [PASO_TELEFONO, ...flow.pasos];
  const sess = { opt, idx: 0, data: {}, ts: Date.now(), telefono, pasos };
  sessions.set(id, sess);
  return botSend(id, pasos[0].pregunta);
}

async function handleStep(id, sess, info) {
  const flow = FLOWS[sess.opt];
  const pasos = sess.pasos || flow.pasos;
  const paso = pasos[sess.idx];
  let valor;

  if (paso.esTelefono) {
    const tel = telefonoDeTexto(info.body);
    if (!tel) {
      return botSend(id, 'No pude reconocer ese número. 🤔\nEscríbelo con los *9 dígitos*, por ejemplo: *9 1234 5678*.');
    }
    sess.telefono = tel;
    valor = tel;
  } else if (paso.esUbicacion) {
    if (info.location) {
      valor = `${info.location.latitude},${info.location.longitude}`;
    } else {
      valor = (info.body || '').trim(); // aceptar dirección escrita
    }
    if (!valor) {
      return botSend(id, 'Necesito tu *ubicación* o tu *dirección* para revisar la cobertura.\nToca 📎 → *Ubicación* → *Enviar ubicación actual*, o escríbeme tu dirección exacta.');
    }
  } else {
    valor = (info.body || '').trim();
    if (!valor) return botSend(id, paso.pregunta);
  }

  sess.data[paso.campo] = valor;
  sess.idx += 1;
  sess.ts = Date.now();

  // ¿Quedan más pasos?
  if (sess.idx < pasos.length) {
    sessions.set(id, sess);
    return botSend(id, pasos[sess.idx].pregunta);
  }

  // Fin del flujo: separar dirección (texto) de ubicación GPS ("lat,lng")
  resetSession(id);
  const ubic = (sess.data.ubicacion || '').trim();
  const esCoords = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(ubic);
  const payload = {
    categoria: flow.categoria,
    nombre: sess.data.nombre || info.notifyName || '',
    telefono: sess.telefono || info.telefono || '',
    direccion: esCoords ? '' : ubic,   // dirección escrita → campo Dirección del panel
    ubicacion: ubic,                    // coords o texto → enlace "Ver en mapa"
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
  if (poolingOut || !sock) return;
  poolingOut = true;
  try {
    const pend = await api('/api/bot/outbox');
    for (const m of pend || []) {
      const chatId = toChatId(m.telefono);
      if (!chatId) { await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' }); continue; }
      await botSend(chatId, m.texto || '');
      // Recordamos que a este cliente le mandamos planes: su próxima respuesta
      // se tratará como su elección (y NO como una opción del menú).
      const telDig = soloDigitos(m.telefono);
      if (telDig) esperaPlan.set(telDig, Date.now() + PLAN_TTL);
      await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' });
      console.log(`[BOT] mensaje automático enviado a ${m.telefono}`);
    }
  } catch (e) { /* se reintenta en el próximo ciclo */ }
  finally { poolingOut = false; }
}

console.log('Iniciando bot de WhatsApp WIFIRED (motor Baileys)…');
start().catch((e) => { console.error('Error al iniciar:', e); process.exit(1); });
setInterval(loadBotConfig, 60 * 1000);      // refresca la config cada minuto
setInterval(pollOutbox, 12 * 1000);         // envía mensajes automáticos pendientes
