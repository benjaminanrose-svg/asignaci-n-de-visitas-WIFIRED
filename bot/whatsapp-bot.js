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
//   API_URL      (opcional)    — URL local de la app. Por defecto http://127.0.0.1:8081
//   EMPRESA      (opcional)    — nombre que saluda el bot.
// ============================================================
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

// Nota: usamos 127.0.0.1 (IPv4) y NO "localhost", porque el fetch de Node
// resuelve "localhost" a IPv6 (::1) y falla si la app sólo escucha en IPv4.
const API_URL = (process.env.API_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';
const EMPRESA = process.env.EMPRESA || 'TELECOMUNICACIONES WIFIRED';
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_wifired');
const CONDICIONES_PDF = path.join(__dirname, 'condiciones.pdf'); // T&C que el bot envía en la contratación

// ---------- Modo prueba ----------
// Es el MISMO bot principal, con un interruptor: cuando está activo, IGNORA a todos
// los clientes y solo atiende a quien escriba la palabra clave (por defecto
// "paralelepipedo"). Ideal para probar sin molestar a nadie.
//
// Se controla desde la PÁGINA (Configuración → Bot). Si la página aún no lo definió,
// se usa la variable MODO_PRUEBA (0/false/no/off para apagar); por defecto viene encendido.
const MODO_PRUEBA_ENV = process.env.MODO_PRUEBA;
const PALABRA_ENV = (process.env.PALABRA_PRUEBA || '').toLowerCase();
function modoPruebaActivo() {
  if (typeof botCfg.modo_prueba === 'boolean') return botCfg.modo_prueba;      // lo manda la página
  if (MODO_PRUEBA_ENV != null && MODO_PRUEBA_ENV !== '') return !/^(0|false|no|off)$/i.test(MODO_PRUEBA_ENV);
  return true; // por defecto, en pruebas
}
function palabraPrueba() {
  return (botCfg.palabra_prueba || PALABRA_ENV || 'paralelepipedo').toLowerCase();
}

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

// Filtro por nodo: Set de teléfonos (9 dígitos) que el bot puede atender, o
// null = atiende a todos. Lo calcula el server según los nodos activos.
let telsPermitidos = null;
async function loadBotConfig() {
  try {
    const c = await api('/api/bot/config');
    if (c && typeof c === 'object') {
      botCfg = { ...botCfg, ...c, horario: { ...botCfg.horario, ...(c.horario || {}) } };
      telsPermitidos = Array.isArray(c.telefonos_permitidos) ? new Set(c.telefonos_permitidos) : null;
    }
  } catch (e) { /* se reintenta en el próximo ciclo */ }
}

// ---------- Textos ----------
const CIERRE = '\n\n_Escribe *menú* si necesitas algo más._ 🙌';

// Flujo por defecto del menú (se usa si la coordinación no editó el flujo en la página).
// Cada paso tiene un "tipo": texto | ubicacion | telefono | correo | rut | foto.
const DEFAULT_FLUJO = {
  intro: 'Cuéntame en qué te puedo ayudar hoy.',
  opciones: [
    {
      n: '1', titulo: 'Problema técnico 🛠️', categoria: 'Soporte',
      desc: 'Internet lento, cortes o sin señal. Coordinamos una visita si hace falta.',
      pasos: [
        { campo: 'nombre', tipo: 'texto', pregunta: 'Lamento el problema con tu servicio. 🛠️ Te ayudo enseguida.\n\nPara empezar, ¿cuál es tu *nombre completo*?' },
        { campo: 'ubicacion', tipo: 'ubicacion', pregunta: 'Gracias. 🙌 ¿En qué *dirección* está ocurriendo el problema?\n\nEscríbela (*calle, número y sector*) o compárteme tu *ubicación*: toca el clip 📎 → *Ubicación* → *Enviar ubicación actual*.' },
        { campo: 'mensaje', tipo: 'texto', pregunta: 'Perfecto. Cuéntame *qué está pasando*, con el mayor detalle posible:\n\n• ¿Estás *sin internet*, va *lento* o hay *cortes* que van y vuelven?\n• ¿*Desde cuándo* ocurre?\n• ¿Afecta a *todos* los equipos o solo a algunos?\n• ¿Las *luces del router* están encendidas, apagadas o parpadeando?\n\n_Mientras más me cuentes, más rápido lo resolvemos._' },
      ],
      confirma: '✅ ¡Listo! Registramos tu solicitud de *soporte técnico* con el N° *{num}*.\n\nNuestro equipo revisará tu caso y, si es necesario, *coordinará una visita técnica* a tu domicilio. Te contactaremos a la brevedad. 🛠️🙌',
    },
    {
      n: '2', titulo: 'Planes y contratación 📶', categoria: 'Contratación',
      desc: 'Revisa cobertura y contrata un plan nuevo.',
      pasos: [
        { campo: 'ubicacion', tipo: 'ubicacion', pregunta: '¡Qué bueno que quieras ser parte de *WIFIRED*! 📶\n\nPrimero revisemos la *cobertura* en tu sector. Compárteme tu *ubicación* (clip 📎 → *Ubicación* → *Enviar ubicación actual*) o escríbeme tu *dirección exacta*: calle, número, sector o parcela y una referencia.' },
        { campo: 'nombre', tipo: 'texto', pregunta: '¡Perfecto! 🙌 ¿Cuál es tu *nombre completo*?' },
      ],
      confirma: '✅ ¡Recibido! Registramos tu solicitud de *contratación* con el N° *{num}*.\n\nAhora revisaremos la *factibilidad* (si nuestra red llega a tu sector). En cuanto la confirmemos, te enviaremos los *planes disponibles* y coordinaremos la *instalación*. 📶\n\nTe contactaremos muy pronto. ¡Gracias por preferirnos!',
    },
    {
      n: '3', titulo: 'Cancelar servicio / Retiro de equipos 📦', categoria: 'Retiro',
      desc: 'Da de baja tu servicio y coordina el retiro de los equipos.',
      pasos: [
        { campo: 'nombre', tipo: 'texto', pregunta: 'Lamentamos que quieras irte. 😔 Te ayudo a gestionar la *baja* y el *retiro de los equipos*.\n\n¿Cuál es tu *nombre completo* (titular del servicio)?' },
        { campo: 'rut', tipo: 'rut', pregunta: 'Gracias. Para ubicar tu cuenta, ¿cuál es tu *RUT*? (ej: 12.345.678-9)' },
        { campo: 'ubicacion', tipo: 'ubicacion', pregunta: '¿En qué *dirección* están instalados los equipos?\n\nEscríbela (*calle, número y sector*) o compárteme tu *ubicación* 📎.' },
        { campo: 'mensaje', tipo: 'texto', pregunta: 'Por último, cuéntame:\n\n• ¿*Motivo* de la baja?\n• ¿Desde qué *fecha* quieres darla?\n• ¿Qué *días u horarios* te acomodan para el retiro?' },
      ],
      confirma: '✅ Registramos tu solicitud de *baja y retiro de equipos* con el N° *{num}*.\n\nCoordinaremos internamente el retiro y te contactaremos para agendar día y hora. 📦\n\nGracias por haber sido parte de *WIFIRED*. 🙌',
    },
    {
      n: '4', titulo: 'Enviar comprobante de pago 💳', categoria: 'Pago',
      desc: 'Envíanos la foto o el archivo de tu comprobante de pago.',
      pasos: [
        { campo: 'nombre', tipo: 'texto', pregunta: 'Te ayudo a registrar tu comprobante de pago. 💳\n\nPara identificar la cuenta, ¿cuál es el *nombre completo del titular* de la cuenta que estás pagando?' },
        { campo: 'rut', tipo: 'rut', pregunta: 'Gracias. ¿Cuál es el *RUT del titular* de la cuenta? (ej: 12.345.678-9)' },
        { campo: 'comprobante', tipo: 'foto', pregunta: 'Perfecto. Ahora envíame la *foto* 📷 o el *archivo* 📎 de tu *comprobante de pago* (transferencia, depósito, etc.).\n\nAsegúrate de que en la imagen se vea *claro* y *completo*:\n• El *N° de transferencia u orden* de la operación\n• El *monto*\n• La *fecha*\n• El *destinatario*' },
      ],
      confirma: '✅ ¡Comprobante *recibido*! Lo registramos con el N° *{num}*.\n\nNuestro equipo lo *revisará* y, cuando confirmemos tu pago, te avisaremos por este medio. 💳🙌',
    },
  ],
};

/** Flujo del menú del bot: SIEMPRE el definido en el código (DEFAULT_FLUJO).
 * El editor de flujo de la página fue retirado para no interferir con las
 * opciones fijas (Soporte, Contratación, Retiro, Pago). */
function getFlujo() {
  return DEFAULT_FLUJO;
}

/** Convierte un paso de la config (con "tipo") en un paso que entiende el motor (con esX). */
function pasoDeConfig(p) {
  const o = { campo: p.campo || 'campo', pregunta: p.pregunta || '' };
  switch (p.tipo) {
    case 'telefono': o.esTelefono = true; break;
    case 'correo': o.esCorreo = true; break;
    case 'rut': o.esRut = true; break;
    case 'ubicacion': o.esUbicacion = true; break;
    case 'foto': o.esFoto = true; break;
    // 'texto' (o desconocido): respuesta libre
  }
  return o;
}

/** Arma los flujos del menú (1, 2, …) a partir del flujo configurado. */
function getFlows() {
  const out = {};
  for (const op of getFlujo().opciones) {
    if (!op || op.n == null) continue;
    out[String(op.n)] = {
      categoria: op.categoria || op.titulo || 'Consulta',
      pasos: (Array.isArray(op.pasos) ? op.pasos : []).map(pasoDeConfig),
      confirma: (num) => String(op.confirma || '').replace(/\{num\}/g, num),
    };
  }
  return out;
}

function menuText() {
  const fl = getFlujo();
  const nums = fl.opciones.map((o) => String(o.n));
  const rango = nums.length > 1 ? `${nums[0]} o ${nums[nums.length - 1]}` : nums[0];
  const ops = fl.opciones.map((o) => `*${o.n}* · ${o.titulo}${o.desc ? `\n    _${o.desc}_` : ''}`).join('\n\n');
  return `¡Hola! 👋 Bienvenido/a a *${EMPRESA}*.
${botCfg.saludo}

${fl.intro} Respóndeme con *un solo número* (${rango}) 👇

${ops}

_Escribe *menú* en cualquier momento para volver a este menú._`;
}

// Proceso de contratación: se inicia cuando el cliente elige un plan (tras recibir la lista).
// Recoge todos los datos del contrato, paso a paso, incluidas las fotos del carnet y la
// aceptación de las condiciones (que el bot toma de la configuración).
const PASOS_CONTRATO = [
  { campo: 'nombre', pregunta: '¡Genial! Para dejar todo listo, te pediré algunos datos, uno por uno. 📝\n\n1️⃣ ¿Cuál es tu *nombre completo*?' },
  { campo: 'rut', esRut: true, pregunta: '2️⃣ ¿Cuál es tu *RUT*? (ej: 12.345.678-9)' },
  { campo: 'telefono', esTelefono: true, pregunta: '3️⃣ ¿Cuál es tu *número de teléfono de contacto*? (9 dígitos, ej: 9 1234 5678)' },
  { campo: 'correo', esCorreo: true, pregunta: '4️⃣ ¿Cuál es tu *correo electrónico*? (ej: nombre@correo.com)' },
  { campo: 'direccion', esUbicacion: true, pregunta: '5️⃣ ¿Cuál es la *dirección exacta de instalación*?\n\nEscríbela (calle, número, sector o parcela y una referencia), o compárteme tu *ubicación* 📎.' },
  { campo: 'carnet_consentimiento', esConsentimiento: true, pregunta: '6️⃣ Antes de pedirte las fotos de tu carnet, necesito tu *autorización* 🔒.\n\nUsaremos las imágenes de tu carnet *solo* para validar tu identidad y gestionar tu contratación, conforme a la *Ley N° 19.628* sobre protección de datos personales. No se comparten con terceros.\n\n¿Nos autorizas a solicitarte y guardar las fotos de tu carnet? Responde *SÍ* para continuar, o *NO*. ✍️' },
  { campo: 'carnet_frente', esFoto: true, pregunta: '7️⃣ ¡Gracias! Ahora necesito una *foto del FRENTE de tu carnet de identidad* 📷 (el lado con tu foto).\n\nTómale una foto clara y envíamela como imagen.' },
  { campo: 'carnet_reverso', esFoto: true, pregunta: '8️⃣ ¡Perfecto! Ahora una *foto del REVERSO de tu carnet* 📷 (el lado de atrás).' },
  { campo: 'condiciones', esCondiciones: true, pregunta: '' },
];

// ---------- Estado en memoria ----------
const sessions = new Map();   // chatId -> { opt, idx, data, ts }
const handoff = new Map();    // chatId -> timestamp hasta el cual el bot NO responde
const lastBotSend = new Map();// chatId -> timestamp del último envío del bot
const desbloqueados = new Map(); // (modo prueba) chatId -> ts, chats que dijeron la palabra clave
const esperaPlan = new Map();    // teléfono (dígitos) -> ts límite: le enviamos planes y esperamos su elección
const esperaConfirmacion = new Map(); // teléfono (dígitos) -> ts límite: le pedimos confirmar su visita (SÍ/NO)
const esperaAnuncios = new Map(); // teléfono (dígitos) -> ts límite: le preguntamos si quiere seguir recibiendo anuncios generales
const SESSION_TTL = 10 * 60 * 1000;      // 10 min sin actividad → se reinicia el flujo
const HANDOFF_TTL = 3 * 60 * 60 * 1000;  // 3 h de silencio cuando entra un humano
const PLAN_TTL = 12 * 60 * 60 * 1000;    // 12 h para reconocer la respuesta del cliente a los planes
const CONFIRM_TTL = 20 * 60 * 60 * 1000; // 20 h para reconocer el SÍ/NO de confirmación de visita
const ANUNCIOS_TTL = 3 * 24 * 60 * 60 * 1000; // 3 días para reconocer el SÍ/NO de anuncios generales

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

/** Valida un correo electrónico de forma sencilla */
function validaCorreo(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x || '').trim()); }
/** Deja solo dígitos y K del RUT; devuelve '' si es claramente inválido (menos de 7 caracteres) */
function normalizaRut(x) { const r = String(x || '').replace(/[^0-9kK]/g, '').toUpperCase(); return r.length >= 7 ? r : ''; }
/** Da formato al RUT: 123456789 -> 12.345.678-9 */
function formateaRut(r) { if (!r) return ''; const dv = r.slice(-1); const n = r.slice(0, -1); return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv; }

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

// Caché de imágenes de comunicados: se descargan del server UNA vez por id.
const mediaCache = new Map(); // media_id -> Buffer (o null si falló)
async function getMediaBuffer(mediaId) {
  if (mediaCache.has(mediaId)) return mediaCache.get(mediaId);
  let buf = null;
  try {
    const r = await api('/api/bot/media/' + mediaId);
    const data = r && r.data ? String(r.data) : '';
    const m = data.match(/^data:[^;]+;base64,(.*)$/);
    if (m) buf = Buffer.from(m[1], 'base64');
  } catch (e) { console.error('No pude descargar la imagen del comunicado:', e.message); }
  mediaCache.set(mediaId, buf);
  return buf;
}

/** Envía una imagen (Buffer) con texto opcional como pie. */
async function botSendImagen(id, buf, caption) {
  lastBotSend.set(id, Date.now());
  try { await sock.sendMessage(id, { image: buf, caption: caption || '' }); } catch (e) { console.error('Error al enviar imagen:', e.message); }
}

function crearTicket(payload) { return api('/api/bot/ticket', { method: 'POST', body: JSON.stringify(payload) }); }

/** Descarga una imagen recibida y la devuelve como data URI (base64), o '' si no es imagen. */
async function getFotoDataUri(m) {
  const mm = (m && m.message) || {};
  // Acepta imagen o archivo (documento: PDF, etc.).
  const media = mm.imageMessage || mm.documentMessage || (mm.documentWithCaptionMessage && mm.documentWithCaptionMessage.message && mm.documentWithCaptionMessage.message.documentMessage);
  if (!media) return '';
  try {
    const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    const mime = media.mimetype || 'image/jpeg';
    return 'data:' + mime + ';base64,' + Buffer.from(buf).toString('base64');
  } catch (e) { console.error('No pude descargar el adjunto:', e.message); return ''; }
}

/** Envía el PDF de Términos y Condiciones (si existe el archivo). Devuelve true si se envió. */
async function enviarCondicionesDoc(id) {
  try {
    if (!fs.existsSync(CONDICIONES_PDF)) return false;
    const buf = fs.readFileSync(CONDICIONES_PDF);
    lastBotSend.set(id, Date.now());
    await sock.sendMessage(id, { document: buf, mimetype: 'application/pdf', fileName: 'Terminos y Condiciones - WIFIRED.pdf' });
    return true;
  } catch (e) { console.error('No pude enviar el PDF de condiciones:', e.message); return false; }
}

/** Resumen con los datos que el cliente entregó, para mostrarlos junto a las condiciones. */
function resumenDatosCliente(d) {
  d = d || {};
  const rut = d.rut ? formateaRut(normalizaRut(d.rut) || d.rut) : '';
  const lineas = [
    d.plan ? `• *Plan:* ${d.plan}` : '',
    d.nombre ? `• *Nombre:* ${d.nombre}` : '',
    rut ? `• *RUT:* ${rut}` : '',
    d.telefono ? `• *Teléfono:* ${d.telefono}` : '',
    d.correo ? `• *Correo:* ${d.correo}` : '',
    d.direccion ? `• *Dirección:* ${d.direccion}` : '',
  ].filter(Boolean);
  return lineas.join('\n');
}

/** Envía la pregunta de un paso (soporta condiciones dinámicas y preguntas como función). */
async function enviarPregunta(id, paso, sess) {
  if (paso.esCondiciones) {
    const enviado = await enviarCondicionesDoc(id);
    if (!enviado) {
      const cond = (botCfg.condiciones || '').trim();
      if (cond) await botSend(id, '📄 *Términos y condiciones del servicio WIFIRED:*\n\n' + cond);
      else await botSend(id, '📄 *Términos y condiciones del servicio.* (Un ejecutivo te los detallará al coordinar la instalación.)');
    }
    const resumen = resumenDatosCliente(sess && sess.data);
    const intro = enviado ? '📄 Te envié el documento con los *Términos y Condiciones* del servicio.' : '';
    const cuerpo = [intro, resumen ? 'Estos son los datos con los que quedará tu contratación:\n' + resumen : ''].filter(Boolean).join('\n\n');
    if (cuerpo) await botSend(id, cuerpo);
    return botSend(id, 'Para *finalizar tu contratación*, ¿estás de acuerdo con las condiciones y con estos datos? Responde *SÍ* para aceptar, o *NO*. ✍️');
  }
  const p = typeof paso.pregunta === 'function' ? paso.pregunta() : paso.pregunta;
  return botSend(id, p);
}

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
      if (modoPruebaActivo()) {
        console.log(`🧪 MODO PRUEBA ACTIVO — el bot solo responde a quien escriba: "${palabraPrueba()}"`);
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
    raw: m,
    body: getText(m),
    location: getLocation(m),
    notifyName: m.pushName || '',
    telefono: telefonoReal(m),
  };
  console.log(`📩 mensaje de ${id} (tel: ${info.telefono || '—'}) · "${(info.body || (info.location ? '[ubicación]' : '')).slice(0, 40)}"`);

  // Filtro por nodo: si la coordinación activó nodos, el bot SOLO responde a los
  // números de los clientes de esos nodos. En modo prueba no aplica (usa la palabra clave).
  if (!modoPruebaActivo() && telsPermitidos) {
    const d9 = soloDigitos(info.telefono).slice(-9);
    if (!d9 || !telsPermitidos.has(d9)) {
      console.log(`⛔ ignorado por filtro de nodo (tel: ${info.telefono || '—'})`);
      return;
    }
  }

  const now = Date.now();

  // Silencio por handoff (humano atendiendo)
  const h = handoff.get(id);
  if (h && now < h) return;
  if (h) handoff.delete(id);

  const text = info.body;
  const low = text.toLowerCase().trim();

  // --- Opt-in / Opt-out (anti-bloqueo, siempre activo aunque esté en prueba) ---
  // Nos escribió → queda como "opt-in" (autoriza recibir comunicados).
  // Responde BAJA/STOP → no recibe más masivos.  ALTA → vuelve a recibir.
  if (info.telefono) {
    const telDig = soloDigitos(info.telefono).slice(-9);
    if (low === 'baja' || low === 'stop' || low === 'no molestar') {
      esperaAnuncios.delete(telDig);
      api('/api/bot/contacto', { method: 'POST', body: JSON.stringify({ telefono: info.telefono, baja: true }) }).catch(() => {});
      return botSend(id, '✅ Listo, no te enviaremos más comunicados masivos.\n\nEscribe *ALTA* cuando quieras volver a recibirlos.');
    }
    if (low === 'alta') {
      api('/api/bot/contacto', { method: 'POST', body: JSON.stringify({ telefono: info.telefono, baja: false }) }).catch(() => {});
      return botSend(id, '✅ Listo, volverás a recibir nuestros comunicados. 🙌');
    }
    // ¿Está respondiendo a la pregunta de "anuncios generales"? (tras un comunicado)
    if (telDig && esperaAnuncios.has(telDig)) {
      const si = /^(s[ií]|si|sí|quiero|acepto|dale|ya|ok|okey|listo|👍)/.test(low);
      const no = /^(no|nop|no quiero|no gracias|negativo|paso)/.test(low);
      if (si || no) {
        esperaAnuncios.delete(telDig);
        api('/api/bot/contacto', { method: 'POST', body: JSON.stringify({ telefono: info.telefono, anuncios: si }) }).catch(() => {});
        return botSend(id, si
          ? '¡Gracias! 🙌 Seguirás recibiendo nuestros *anuncios generales*.'
          : '✅ Listo, no te enviaremos más *anuncios generales*. Los avisos importantes de tu servicio te seguirán llegando.');
      }
      // Si respondió otra cosa, seguimos esperando su SÍ/NO y atendemos el mensaje normal.
    }
    api('/api/bot/contacto', { method: 'POST', body: JSON.stringify({ telefono: info.telefono }) }).catch(() => {});
  }

  // Modo prueba: solo atendemos a quien escriba la palabra clave; el resto se ignora.
  if (modoPruebaActivo()) {
    if (low === palabraPrueba()) {
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

  // Sin flujo activo: primero vemos si está respondiendo a algo que le pedimos.
  if (!sess) {
    const telDig = soloDigitos(info.telefono);

    // ¿Está respondiendo a la confirmación de su visita? (SÍ / NO)
    if (telDig && esperaConfirmacion.has(telDig)) {
      const esSi = /^(s[ií]|si|sí|confirm|de acuerdo|dale|ya|ok|okey|okay|listo|correcto|asi es|así es|👍)/i.test(low);
      const esNo = /^(no|cancel|nop|negativo|no puedo|no podr)/i.test(low);
      if (!esSi && !esNo) {
        return botSend(id, 'Para *confirmar* tu visita responde *SÍ*; para *cancelarla* responde *NO*. 🙌');
      }
      esperaConfirmacion.delete(telDig);
      try {
        const r = await api('/api/bot/confirmar-visita', {
          method: 'POST',
          body: JSON.stringify({ telefono: info.telefono || telDig, respuesta: esNo ? 'no' : 'si' }),
        });
        if (r && r.accion === 'cancelada') {
          return botSend(id, 'Entendido, *cancelamos* tu visita. ❌\nSi quieres reagendar, escribe *menú* y con gusto coordinamos otra fecha. 🙌');
        }
        return botSend(id, '¡Gracias por confirmar! ✅ Tu visita queda *confirmada*. Te esperamos. 🙌');
      } catch (e) {
        console.error('No se pudo registrar la confirmación:', e.message);
        return botSend(id, 'Recibimos tu respuesta, ¡gracias! Un ejecutivo la revisará. 🙌');
      }
    }

    if (telDig && esperaPlan.has(telDig)) {
      esperaPlan.delete(telDig);
      try {
        await api('/api/bot/plan-elegido', {
          method: 'POST',
          body: JSON.stringify({ telefono: info.telefono || telDig, nombre: info.notifyName || '', eleccion: text }),
        });
      } catch (e) { console.error('No se pudo registrar la elección de plan:', e.message); }
      // Iniciamos el PROCESO DE CONTRATACIÓN: recogemos todos los datos del contrato.
      await botSend(id, '¡Excelente elección! 🎉 Vamos a *dejar todo listo para tu contratación*.');
      const cs = { opt: 'CONTRATO', idx: 0, data: { plan: text }, ts: Date.now(), telefono: info.telefono || telDig, telefono_original: info.telefono || telDig, pasos: PASOS_CONTRATO.slice() };
      sessions.set(id, cs);
      return enviarPregunta(id, cs.pasos[0], cs);
    }

    // Selección del menú: SOLO un número solo (según las opciones del flujo), para no confundir con planes ni teléfonos.
    const numsMenu = getFlujo().opciones.map((o) => String(o.n));
    const mOpt = text.match(/^\s*(\d+)[\s.)\-]*$/);
    const opt = mOpt && numsMenu.includes(mOpt[1]) ? mOpt[1] : null;
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

  const flow = getFlows()[opt];
  if (!flow) return botSend(id, menuText());
  // Si no tenemos el teléfono real, lo pedimos como primer paso del flujo.
  const pasos = telefono ? flow.pasos.slice() : [PASO_TELEFONO, ...flow.pasos];
  const sess = { opt, idx: 0, data: {}, ts: Date.now(), telefono, pasos, flow };
  sessions.set(id, sess);
  return enviarPregunta(id, pasos[0], sess);
}

async function handleStep(id, sess, info) {
  const flow = sess.flow || getFlows()[sess.opt];   // undefined en el proceso de contratación (usa sess.pasos)
  const pasos = sess.pasos || (flow && flow.pasos) || [];
  const paso = pasos[sess.idx];
  let valor;

  if (paso.esTelefono) {
    const tel = telefonoDeTexto(info.body);
    if (!tel) return botSend(id, 'No pude reconocer ese número. 🤔\nEscríbelo con los *9 dígitos*, por ejemplo: *9 1234 5678*.');
    sess.telefono = tel;
    valor = tel;
  } else if (paso.esCorreo) {
    const c = (info.body || '').trim();
    if (!validaCorreo(c)) return botSend(id, 'Ese correo no parece válido. 🤔 Escríbelo así: *nombre@correo.com* 📧');
    valor = c;
  } else if (paso.esRut) {
    const r = normalizaRut(info.body);
    if (!r) return botSend(id, 'Ese RUT no parece válido. 🤔 Escríbelo con guión, por ejemplo: *12.345.678-9*');
    valor = r;
  } else if (paso.esFoto) {
    const foto = await getFotoDataUri(info.raw);
    if (!foto) return botSend(id, 'Necesito que me envíes una *foto* 📷 o un *archivo* 📎 (como imagen o documento, no como texto).');
    valor = foto;
  } else if (paso.esConsentimiento) {
    const low = (info.body || '').toLowerCase();
    const si = /^(s[ií]|si|sí|acepto|autorizo|de acuerdo|estoy de acuerdo|ok|dale|confirmo|👍)/.test(low);
    const no = /^(no|rechazo|no acepto|no autorizo|no estoy)/.test(low);
    if (!si && !no) return botSend(id, 'Para continuar necesito tu respuesta: responde *SÍ* para *autorizar*, o *NO*. ✍️');
    if (no) {
      resetSession(id);
      handoff.set(id, Date.now() + HANDOFF_TTL);
      return botSend(id, 'Entendido. 🙏 Sin tu autorización no podemos solicitar las fotos del carnet por aquí, así que no es posible continuar la contratación por este medio.\n\nSi cambias de opinión, escribe *menú*. Un ejecutivo queda atento para resolver tus dudas.');
    }
    valor = 'autorizado';
  } else if (paso.esCondiciones) {
    const low = (info.body || '').toLowerCase();
    const si = /^(s[ií]|si|sí|acepto|de acuerdo|estoy de acuerdo|ok|dale|confirmo|👍)/.test(low);
    const no = /^(no|rechazo|no acepto|no estoy)/.test(low);
    if (!si && !no) return botSend(id, 'Para continuar necesito tu respuesta: responde *SÍ* para *aceptar* las condiciones, o *NO*. ✍️');
    if (no) {
      resetSession(id);
      handoff.set(id, Date.now() + HANDOFF_TTL);
      return botSend(id, 'Entendido. 🙏 Sin la aceptación de las condiciones no podemos continuar con la contratación por aquí.\n\nSi cambias de opinión, escribe *menú*. Un ejecutivo queda atento para resolver tus dudas.');
    }
    valor = 'aceptadas';
  } else if (paso.esUbicacion) {
    if (info.location) valor = `${info.location.latitude},${info.location.longitude}`;
    else valor = (info.body || '').trim();
    if (!valor) return botSend(id, 'Necesito tu *ubicación* o tu *dirección*.\nToca 📎 → *Ubicación* → *Enviar ubicación actual*, o escríbeme tu dirección exacta.');
  } else {
    valor = (info.body || '').trim();
    if (!valor) return enviarPregunta(id, paso, sess);
  }

  sess.data[paso.campo] = valor;
  sess.idx += 1;
  sess.ts = Date.now();

  // ¿Quedan más pasos?
  if (sess.idx < pasos.length) {
    sessions.set(id, sess);
    return enviarPregunta(id, pasos[sess.idx], sess);
  }

  // Fin del flujo
  resetSession(id);
  if (sess.opt === 'CONTRATO') return finalizarContrato(id, sess, info);

  // Flujos del menú: separar dirección (texto) de ubicación GPS ("lat,lng") y crear el ticket
  const ubic = (sess.data.ubicacion || '').trim();
  const esCoords = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(ubic);
  // Junta los adjuntos (comprobantes, fotos) que se hayan capturado en pasos tipo foto.
  const adjuntos = pasos.filter((p) => p.esFoto && sess.data[p.campo]).map((p) => sess.data[p.campo]);
  const payload = {
    categoria: flow.categoria,
    nombre: sess.data.nombre || info.notifyName || '',
    telefono: sess.telefono || info.telefono || '',
    direccion: esCoords ? '' : ubic,
    ubicacion: ubic,
    mensaje: sess.data.mensaje || '',
    rut: sess.data.rut ? formateaRut(sess.data.rut) : '',
    email: sess.data.correo || '',
    adjuntos,
  };
  try {
    const t = await crearTicket(payload);
    return botSend(id, flow.confirma(t.num) + CIERRE);
  } catch (e) {
    console.error('No se pudo crear el ticket:', e.message);
    return botSend(id, '⚠️ Hubo un problema al registrar tu solicitud. Por favor intenta de nuevo en unos minutos o escribe *menú*.');
  }
}

/** Cierra el proceso de contratación: envía todos los datos + fotos del carnet al ticket. */
async function finalizarContrato(id, sess, info) {
  const d = sess.data;
  const ubic = (d.direccion || '').trim();
  const esCoords = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(ubic);
  const payload = {
    telefono: sess.telefono_original || d.telefono || info.telefono || '',
    telefono_declarado: d.telefono || '',
    plan: d.plan || '',
    nombre: d.nombre || info.notifyName || '',
    rut: d.rut ? formateaRut(d.rut) : '',
    correo: d.correo || '',
    direccion: esCoords ? '' : ubic,
    ubicacion: ubic,
    carnet_frente: d.carnet_frente || '',
    carnet_reverso: d.carnet_reverso || '',
    carnet_consentimiento: d.carnet_consentimiento === 'autorizado' ? 'autorizado' : '',
    condiciones: d.condiciones === 'aceptadas' ? 'aceptadas' : '',
  };
  try { await api('/api/bot/contratacion-datos', { method: 'POST', body: JSON.stringify(payload) }); }
  catch (e) { console.error('No se pudo guardar la contratación:', e.message); }
  handoff.set(id, Date.now() + HANDOFF_TTL);
  const nom = (d.nombre || '').trim().split(/\s+/)[0] || '';
  return botSend(id, `✅ ¡Listo${nom ? ', ' + nom : ''}! Recibimos todos tus datos y tu aceptación de las condiciones. 🎉\n\nUn ejecutivo revisará tu contratación y coordinará contigo la *instalación*. ¡Bienvenido/a a *${EMPRESA}*! 🙌`);
}

// ---------- Bandeja de salida: envía los mensajes automáticos (planes, etc.) ----------
let poolingOut = false;
// Ritmo controlado para envíos masivos (anti-baneo): un LOTE por ciclo con pausas
// cortas aleatorias entre cada uno y un tope diario. Los mensajes normales no se frenan.
const BC_MIN_MS = 3000, BC_MAX_MS = 7000, BC_MAX_DIA = 500, BC_POR_CICLO = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bcHoy = 0, bcDia = '';
async function pollOutbox() {
  if (poolingOut || !sock) return;
  poolingOut = true;
  let bcCiclo = 0; // cuántos masivos llevamos enviados en este ciclo
  try {
    const pend = await api('/api/bot/outbox');
    if (pend && pend.length) console.log(`[BOT] cola: ${pend.length} pendientes (primero tipo=${pend[0].tipo || '-'} tel=${pend[0].telefono})`);
    for (const m of pend || []) {
      const chatId = toChatId(m.telefono);
      if (!chatId) { await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' }); continue; }
      if (m.tipo === 'broadcast' || m.tipo === 'broadcast_ask') {
        const hoy = new Date().toISOString().slice(0, 10);
        if (hoy !== bcDia) { bcDia = hoy; bcHoy = 0; }
        if (bcHoy >= BC_MAX_DIA) continue;      // tope diario: se retoma mañana
        if (bcCiclo >= BC_POR_CICLO) continue;  // ya enviamos el lote de este ciclo
        if (m.media_id) {
          const buf = await getMediaBuffer(m.media_id);
          if (buf) await botSendImagen(chatId, buf, m.texto || '');
          else await botSend(chatId, m.texto || ''); // si la imagen falla, al menos va el texto
        } else {
          await botSend(chatId, m.texto || '');
        }
        await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' });
        bcHoy++; bcCiclo++;
        // Si preguntamos por anuncios generales, su próxima respuesta (SÍ/NO) se registra como preferencia.
        if (m.tipo === 'broadcast_ask') { const td = soloDigitos(m.telefono).slice(-9); if (td) esperaAnuncios.set(td, Date.now() + ANUNCIOS_TTL); }
        console.log(`[BOT] masivo enviado a ${m.telefono} (${bcHoy} hoy)`);
        if (bcCiclo < BC_POR_CICLO) await sleep(BC_MIN_MS + Math.random() * (BC_MAX_MS - BC_MIN_MS));
        continue;
      }
      await botSend(chatId, m.texto || '');
      const telDig = soloDigitos(m.telefono);
      if (telDig && m.tipo === 'confirmacion') {
        // Le pedimos confirmar su visita: su próxima respuesta (SÍ/NO) se procesa como confirmación.
        esperaConfirmacion.set(telDig, Date.now() + CONFIRM_TTL);
      } else if (telDig && m.tipo !== 'aviso') {
        // Le mandamos planes: su próxima respuesta se trata como su elección (no como menú).
        // Los avisos sueltos (ej: pago validado) NO arman esta espera.
        esperaPlan.set(telDig, Date.now() + PLAN_TTL);
      }
      await api('/api/bot/outbox/' + m.id + '/sent', { method: 'POST' });
      console.log(`[BOT] mensaje automático enviado a ${m.telefono}`);
    }
  } catch (e) { console.error('[BOT] error en pollOutbox:', e.message); }
  finally { poolingOut = false; }
}

console.log('Iniciando bot de WhatsApp WIFIRED (motor Baileys)…');
start().catch((e) => { console.error('Error al iniciar:', e); process.exit(1); });
setInterval(loadBotConfig, 60 * 1000);      // refresca la config cada minuto
setInterval(pollOutbox, 8 * 1000);          // envía mensajes automáticos pendientes (lote por ciclo)
