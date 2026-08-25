// ============================================================
// WIFIRED · Vista Configuración (sólo coordinación)
// Edita las listas del formulario de visitas (tipos, bloques,
// estados, prioridades, nodos) y los datos de la empresa para
// la orden de trabajo.
// ============================================================
import * as store from '../store.js';
import { esc, toast, bindField, validaEmail } from '../util.js';
import { openModal, closeModal } from '../components.js';
import { broadcastModal } from './servicios.js';

// ---------- Editor visual del flujo del bot ----------
// Cada paso guarda un "dato" (qué información pide). De ahí se derivan el campo y la validación.
const DATOS = [
  { v: 'nombre', l: 'Nombre del cliente' },
  { v: 'ubicacion', l: 'Dirección o ubicación' },
  { v: 'mensaje', l: 'Detalle / mensaje' },
  { v: 'telefono', l: 'Teléfono' },
];
const DATO_MAP = {
  nombre: { campo: 'nombre', tipo: 'texto' },
  ubicacion: { campo: 'ubicacion', tipo: 'ubicacion' },
  mensaje: { campo: 'mensaje', tipo: 'texto' },
  telefono: { campo: 'telefono', tipo: 'telefono' },
};
/** A partir de un paso guardado (campo/tipo) deduce el "dato" para el editor. */
function datoDe(p) {
  if (p.tipo === 'telefono' || p.campo === 'telefono') return 'telefono';
  if (p.campo === 'ubicacion' || p.tipo === 'ubicacion') return 'ubicacion';
  if (p.campo === 'mensaje') return 'mensaje';
  return 'nombre';
}
// Flujo por defecto para el editor (refleja lo que trae el bot de fábrica).
const DEFAULT_FLUJO_APP = {
  intro: 'Cuéntame en qué te puedo ayudar hoy.',
  opciones: [
    {
      titulo: 'Soporte técnico 🛠️', categoria: 'Soporte',
      desc: 'Internet lento, cortes, sin señal o cualquier falla. Si hace falta, coordinamos una visita técnica a tu domicilio.',
      pasos: [
        { dato: 'nombre', pregunta: 'Lamento mucho el problema con tu servicio. 🛠️ Te ayudo enseguida.\n\nPara empezar, ¿cuál es tu *nombre completo*?' },
        { dato: 'ubicacion', pregunta: 'Gracias. 🙌 ¿En qué *dirección* está ocurriendo el problema?\n\nEscríbela con *calle, número y sector*, o compárteme tu *ubicación* 📎.' },
        { dato: 'mensaje', pregunta: 'Perfecto. Cuéntame *con el mayor detalle posible qué está pasando*:\n\n• ¿*Sin internet*, *lento* o *cortes*?\n• ¿*Desde cuándo*?\n• ¿Afecta a *todos* los equipos o solo a algunos?\n• ¿Las *luces del router* encendidas o parpadeando?' },
      ],
      confirma: '✅ ¡Listo! Registramos tu solicitud de *soporte técnico* con el N° *{num}*.\n\nNuestro equipo revisará tu caso y, si es necesario, *coordinará una visita técnica*. Te contactaremos a la brevedad. 🛠️🙌',
    },
    {
      titulo: 'Planes y contratación 📶', categoria: 'Contratación',
      desc: 'Conoce nuestros planes y contrata internet nuevo.',
      pasos: [
        { dato: 'ubicacion', pregunta: '¡Qué bueno que quieras ser parte de *WIFIRED*! 📶\n\nPrimero revisemos *cobertura* en tu sector. Compárteme tu *ubicación* 📎 o escríbeme tu *dirección exacta*: calle, número, sector y una referencia.' },
        { dato: 'nombre', pregunta: '¡Perfecto! 🙌 ¿Cuál es tu *nombre completo*?' },
      ],
      confirma: '✅ ¡Recibido! Registramos tu solicitud de *contratación* con el N° *{num}*.\n\nRevisaremos la *factibilidad* y te enviaremos los *planes disponibles*. ¡Gracias por preferirnos! 📶',
    },
    {
      titulo: 'Cancelar servicio / retiro de equipos 📦', categoria: 'Retiro',
      desc: 'Solicita dar de baja tu servicio y coordinar el retiro de los equipos.',
      pasos: [
        { dato: 'nombre', pregunta: 'Lamentamos que quieras irte. 😔 Te ayudo a gestionar la *baja* y el *retiro de los equipos*.\n\nPara empezar, ¿cuál es tu *nombre completo* (titular del servicio)?' },
        { dato: 'ubicacion', pregunta: 'Gracias. 🙌 ¿En qué *dirección* están instalados los equipos?\n\nEscríbela con *calle, número y sector*, o compárteme tu *ubicación* 📎.' },
        { dato: 'mensaje', pregunta: 'Entendido. Por último: ¿*motivo* de la cancelación, desde qué *fecha* y qué *días/horarios* te acomodan para el retiro?' },
      ],
      confirma: '✅ Registramos tu solicitud de *cancelación y retiro de equipos* con el N° *{num}*.\n\nCoordinaremos internamente el retiro y te contactaremos para agendar. 📦 Gracias por haber sido parte de *WIFIRED*. 🙌',
    },
  ],
};
/** Convierte el flujo guardado (con campo/tipo) al modelo del editor (con dato). */
function flujoAModelo(f) {
  if (!f || !Array.isArray(f.opciones) || !f.opciones.length) return JSON.parse(JSON.stringify(DEFAULT_FLUJO_APP));
  return {
    intro: f.intro || DEFAULT_FLUJO_APP.intro,
    opciones: f.opciones.map((op) => ({
      titulo: op.titulo || '', categoria: op.categoria || op.titulo || 'Consulta', desc: op.desc || '',
      confirma: op.confirma || '',
      pasos: (Array.isArray(op.pasos) ? op.pasos : []).map((p) => ({ dato: datoDe(p), pregunta: p.pregunta || '' })),
    })),
  };
}
/** Convierte el modelo del editor al flujo que guarda la config (con campo/tipo, y numera 1..N). */
function modeloAFlujo(m) {
  return {
    intro: (m.intro || '').trim(),
    opciones: m.opciones.map((op, i) => ({
      n: String(i + 1),
      titulo: (op.titulo || '').trim(),
      desc: (op.desc || '').trim(),
      categoria: (op.categoria || op.titulo || 'Consulta').trim(),
      confirma: (op.confirma || '').trim(),
      pasos: op.pasos.map((p) => {
        const map = DATO_MAP[p.dato] || DATO_MAP.nombre;
        return { campo: map.campo, tipo: map.tipo, pregunta: (p.pregunta || '').trim() };
      }).filter((p) => p.pregunta),
    })).filter((op) => op.titulo && op.pasos.length),
  };
}

/** Editor de lista simple: filas con input + botón eliminar, y "＋ Agregar" */
function listEditor(key, items) {
  const row = (val = '') => `
    <div class="cfg-row" data-row>
      <input class="input" data-item value="${esc(val)}" placeholder="Escribe un valor…">
      <button class="icon-btn" data-remove title="Quitar">✕</button>
    </div>`;
  return `
    <div class="cfg-list" data-list="${esc(key)}">
      ${(items || []).map((x) => row(x)).join('')}
    </div>
    <button class="btn btn-sm" data-add="${esc(key)}">＋ Agregar</button>`;
}

function collectList(root, key) {
  return Array.from(root.querySelectorAll(`[data-list="${key}"] [data-item]`))
    .map((i) => i.value.trim()).filter(Boolean);
}

/** Descarga un respaldo completo como archivo JSON. Lanza si falla. */
async function downloadBackup() {
  const data = await store.getBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `respaldo_wifired_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Flujo seguro para vaciar el historial: respaldo automático → confirmación escrita → borrado */
async function wipeFlow(root) {
  const total = store.visitas().length;
  if (!total) { toast('El historial ya está vacío.', 'info'); return; }

  // 1) Respaldo automático de seguridad antes de borrar nada
  toast('Descargando respaldo de seguridad…');
  try {
    await downloadBackup();
  } catch (err) {
    toast('No se pudo descargar el respaldo. Se canceló el borrado por seguridad.', 'info');
    return;
  }

  // 2) Confirmación escrita
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>🧹 Vaciar historial de visitas</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p>Estás a punto de borrar <b>${total} visita${total === 1 ? '' : 's'}</b>. Esto <b>no se puede deshacer</b>.</p>
      <p class="muted-sm">✅ Se acaba de descargar un respaldo de seguridad en tu dispositivo.<br>👥 Tus <b>técnicos</b> y tu <b>configuración</b> NO se borran.</p>
      <p style="margin-top:14px">Para confirmar, escribe <b>BORRAR TODO</b> en el recuadro:</p>
      <input class="input" data-confirm placeholder="BORRAR TODO" autocomplete="off" style="margin-top:6px">
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancelar</button>
      <div class="grow"></div>
      <button class="btn btn-danger" data-do disabled>🗑 Borrar definitivamente</button>
    </div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const input = node.querySelector('[data-confirm]');
  const doBtn = node.querySelector('[data-do]');
  input.oninput = () => { doBtn.disabled = input.value.trim().toUpperCase() !== 'BORRAR TODO'; };
  doBtn.onclick = async () => {
    doBtn.disabled = true; doBtn.textContent = 'Borrando…';
    try {
      const r = await store.limpiarHistorial();
      closeModal();
      toast(`Historial vaciado ✓ (${r && r.borradas != null ? r.borradas : total} visitas borradas)`);
      renderConfig(root);
    } catch (err) {
      toast(err.message || 'No se pudo vaciar el historial', 'info');
      doBtn.disabled = false; doBtn.textContent = '🗑 Borrar definitivamente';
    }
  };
  openModal(node, 'sm', { dismissable: false });
  setTimeout(() => input.focus(), 50);
}

export function renderConfig(root) {
  if (!store.isCoordinador()) { root.innerHTML = '<div class="empty-state"><div class="es-ico">🔒</div><p>Sólo coordinación puede editar la configuración.</p></div>'; return; }

  const cfg = store.configFull() || {};
  const emp = cfg.empresa || {};
  const fonos = Array.isArray(emp.fonos) ? emp.fonos.join(', ') : (emp.fonos || '');
  const avisos = cfg.avisos_cliente !== false;
  const bot = cfg.bot || {};

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>⚙️ Configuración</h2>
        <span class="muted-sm">Personaliza lo que aparece al agendar y los datos de la empresa</span>
      </div>
      <button class="btn btn-primary" data-save>Guardar cambios</button>
    </div>

    <div class="cfg-wrap">
      <div class="card cfg-card">
        <h3 class="cfg-title">🧾 Datos de la empresa (orden de trabajo)</h3>
        <div class="form-grid">
          <div class="field full"><label>Nombre / Razón social</label><input class="input" data-emp="nombre" value="${esc(emp.nombre || '')}"></div>
          <div class="field full"><label>Dirección</label><input class="input" data-emp="direccion" value="${esc(emp.direccion || '')}"></div>
          <div class="field full"><label>Teléfonos (separados por coma)</label><input class="input" data-emp="fonos" value="${esc(fonos)}" placeholder="569 1234 5678, 569 8765 4321"></div>
          <div class="field"><label>Correo de contacto</label><input class="input" data-emp="email" value="${esc(emp.email || '')}"></div>
          <div class="field"><label>Trabajos autorizados por</label><input class="input" data-emp="autoriza" value="${esc(emp.autoriza || '')}"></div>
        </div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">📧 Avisos automáticos al cliente</h3>
        <p class="muted-sm">Cuando está encendido, el cliente recibe por correo un aviso al agendarse su visita y un recordatorio el día antes. Requiere tener el correo configurado en el servidor y que la visita tenga correo del cliente.</p>
        <label class="cfg-switch" style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer">
          <input type="checkbox" data-avisos ${avisos ? 'checked' : ''} style="width:18px;height:18px">
          <span><b>Enviar avisos y recordatorios al cliente</b></span>
        </label>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🤖 Bot de WhatsApp</h3>
        <p class="muted-sm">El asistente que atiende a tus clientes por WhatsApp: menú, tickets, planes, horario y (pronto) avisos automáticos. Tiene su propia sección para no mezclarla con el resto.</p>
        <div class="row" style="align-items:center; gap:8px; flex-wrap:wrap; margin-top:12px">
          <span class="tag" style="background:color-mix(in srgb, ${bot.activo !== false ? '#10b981' : '#94a3b8'} 16%, transparent); color:${bot.activo !== false ? '#10b981' : '#94a3b8'}; border-color:color-mix(in srgb, ${bot.activo !== false ? '#10b981' : '#94a3b8'} 40%, var(--border))">${bot.activo !== false ? '🟢 Activo' : '⚪ Inactivo'}</span>
          ${bot.modo_prueba !== false ? '<span class="tag">🧪 En modo prueba</span>' : ''}
          <div class="grow"></div>
          <button class="btn btn-primary" data-openbot>⚙️ Abrir configuración del Bot →</button>
        </div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🛠 Tipos de servicio</h3>
        <p class="muted-sm">Aparecen en “Tipo de visita” al agendar.</p>
        ${listEditor('tipos', cfg.tipos)}
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🕐 Bloques horarios</h3>
        ${listEditor('bloques', cfg.bloques)}
      </div>

      <div class="cfg-two">
        <div class="card cfg-card">
          <h3 class="cfg-title">🏷 Estados</h3>
          <p class="muted-sm">Ojo: <b>Pendiente</b>, <b>Completada</b> y <b>Cancelada</b> tienen comportamiento especial; conviene no quitarlos.</p>
          ${listEditor('estados', cfg.estados)}
        </div>
        <div class="card cfg-card">
          <h3 class="cfg-title">⚑ Prioridades</h3>
          <p class="muted-sm">La primera de la lista se usa como orden más urgente.</p>
          ${listEditor('prioridades', cfg.prioridades)}
        </div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">📡 Nodos</h3>
        <p class="muted-sm">Los nodos (zonas / puntos de red) que se pueden asignar a cada visita. Se usan para las estadísticas por nodo del panel.</p>
        ${listEditor('nodos', cfg.nodos)}
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">💾 Respaldo de datos</h3>
        <p class="muted-sm">Descarga una copia de seguridad completa (clientes, visitas, asignaciones, estados y configuración) en un archivo. Guárdala en tu computador, Google Drive o un pendrive. El servidor también genera un respaldo automático cada madrugada.</p>
        <button class="btn" data-backup style="margin-top:10px">⭳ Descargar respaldo completo ahora</button>
      </div>

      <div class="card cfg-card cfg-danger">
        <h3 class="cfg-title">🧹 Empezar de cero (vaciar historial)</h3>
        <p class="muted-sm">Borra <b>todas</b> las visitas para arrancar con las asignaciones reales. <b>No borra</b> tus técnicos ni tu configuración. Antes de borrar, el sistema descarga solo un respaldo de todo por seguridad. <b style="color:var(--danger,#ef4444)">Esta acción no se puede deshacer.</b></p>
        <button class="btn btn-danger" data-wipe style="margin-top:10px">🗑 Vaciar historial de visitas…</button>
      </div>

      <div class="cfg-footbar">
        <button class="btn btn-primary" data-save>Guardar cambios</button>
      </div>
    </div>`;

  // Agregar / quitar filas
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    const list = root.querySelector(`[data-list="${b.dataset.add}"]`);
    const div = document.createElement('div');
    div.className = 'cfg-row'; div.setAttribute('data-row', '');
    div.innerHTML = '<input class="input" data-item value="" placeholder="Escribe un valor…"><button class="icon-btn" data-remove title="Quitar">✕</button>';
    list.appendChild(div);
    div.querySelector('[data-remove]').onclick = () => div.remove();
    div.querySelector('[data-item]').focus();
  }));
  root.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = () => b.closest('[data-row]').remove()));

  // Validación de correos
  bindField(root.querySelector('[data-emp="email"]'), { validate: validaEmail, msg: 'Correo inválido' });

  // Descargar respaldo completo
  root.querySelector('[data-backup]').onclick = async (e) => {
    const btn = e.currentTarget; btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Generando…';
    try {
      await downloadBackup();
      toast('Respaldo descargado ✓');
    } catch (err) { toast(err.message || 'No se pudo generar el respaldo', 'info'); }
    btn.disabled = false; btn.textContent = orig;
  };

  // Vaciar historial (empezar de cero) — con respaldo previo y confirmación escrita
  root.querySelector('[data-wipe]').onclick = () => wipeFlow(root);

  // Abrir la sección dedicada del Bot de WhatsApp
  root.querySelector('[data-openbot]').onclick = () => renderBotConfig(root);

  // Guardar
  const doSave = async (btn) => {
    const empEmail = (root.querySelector('[data-emp="email"]').value || '').trim();
    if (empEmail && !validaEmail(empEmail)) { toast('El correo de contacto de la empresa no es válido', 'info'); return; }
    const empFonos = (root.querySelector('[data-emp="fonos"]').value || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const payload = {
      empresa: {
        nombre: root.querySelector('[data-emp="nombre"]').value.trim(),
        direccion: root.querySelector('[data-emp="direccion"]').value.trim(),
        fonos: empFonos,
        email: root.querySelector('[data-emp="email"]').value.trim(),
        autoriza: root.querySelector('[data-emp="autoriza"]').value.trim(),
      },
      tipos: collectList(root, 'tipos'),
      bloques: collectList(root, 'bloques'),
      estados: collectList(root, 'estados'),
      prioridades: collectList(root, 'prioridades'),
      nodos: collectList(root, 'nodos'),
      avisos_cliente: root.querySelector('[data-avisos]').checked,
    };
    if (!payload.tipos.length) { toast('Deja al menos un tipo de servicio', 'info'); return; }
    if (!payload.estados.length) { toast('Deja al menos un estado', 'info'); return; }
    if (!payload.prioridades.length) { toast('Deja al menos una prioridad', 'info'); return; }
    root.querySelectorAll('[data-save]').forEach((b) => { b.disabled = true; });
    try {
      await store.saveConfig(payload);
      toast('Configuración guardada ✓');
      renderConfig(root);
    } catch (e) {
      toast(e.message || 'No se pudo guardar', 'info');
      root.querySelectorAll('[data-save]').forEach((b) => { b.disabled = false; });
    }
  };
  root.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => doSave(b)));
}

// ============================================================
// Sección dedicada del Bot de WhatsApp (se abre desde Configuración)
// ============================================================
function renderBotConfig(root) {
  if (!store.isCoordinador()) { renderConfig(root); return; }
  const cfg = store.configFull() || {};
  const bot = cfg.bot || {};
  const bh = bot.horario || {};
  const cvv = bot.confirma_visita || {};
  const cond = bot.condiciones || '';
  const sw = 'display:flex;align-items:center;gap:10px;cursor:pointer';
  const cb = 'width:18px;height:18px';

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>🤖 Bot de WhatsApp</h2>
        <span class="muted-sm">Toda la configuración del asistente, en un solo lugar</span>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn" data-back>← Volver</button>
        <button class="btn btn-primary" data-savebot>Guardar cambios</button>
      </div>
    </div>

    <div class="cfg-wrap">
      <div class="card cfg-card">
        <h3 class="cfg-title">⚙️ General</h3>
        <label style="${sw};margin:6px 0">
          <input type="checkbox" data-b="activo" ${bot.activo !== false ? 'checked' : ''} style="${cb}">
          <span><b>Bot activo</b> — responde automáticamente a los clientes</span>
        </label>
        <div style="border-top:1px solid var(--border);margin:14px 0"></div>
        <label style="${sw};margin:6px 0">
          <input type="checkbox" data-b="modo_prueba" ${bot.modo_prueba !== false ? 'checked' : ''} style="${cb}">
          <span><b>Modo prueba</b> 🧪 — el bot solo responde a quien escriba la palabra clave (para probar sin molestar a clientes reales)</span>
        </label>
        <div class="field" style="margin-top:8px;max-width:280px">
          <label>Palabra clave del modo prueba</label>
          <input class="input" data-b="palabra_prueba" value="${esc(bot.palabra_prueba || 'paralelepipedo')}" autocomplete="off">
        </div>
        <p class="muted-sm" style="margin-top:6px">💡 Cuando termines de probar, <b>apaga el modo prueba</b> y el bot atenderá a todos los clientes con “hola”.</p>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🔀 Flujo del menú (editor visual)</h3>
        <p class="muted-sm">Mira y edita el recorrido del bot: las opciones del menú (Soporte, Contratación…), qué pregunta en cada paso y el mensaje de confirmación. Los cambios se aplican al bot en menos de 1 minuto.</p>
        <button class="btn btn-primary" data-openflow style="margin-top:12px">🔀 Abrir editor del flujo →</button>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">✉️ Envío masivo de WhatsApp</h3>
        <p class="muted-sm">Envía un mensaje a todos los clientes de un <b>nodo</b> (o a todos). El bot los manda de a uno con pausa (15–45 seg) para no arriesgar el número.</p>
        <button class="btn btn-primary" data-openbroadcast style="margin-top:12px">✉️ Redactar envío masivo →</button>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">💬 Saludo del menú</h3>
        <div class="field full"><label>Primera frase que ve el cliente al escribir</label>
          <textarea class="textarea" data-b="saludo" placeholder="Soy el asistente virtual…">${esc(bot.saludo || '')}</textarea></div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">📶 Planes</h3>
        <p class="muted-sm">Este texto se le envía al cliente con el botón “Enviar planes por WhatsApp” del ticket. Usa *asteriscos* para negrita.</p>
        <div class="field full" style="margin-top:8px">
          <textarea class="textarea" data-b="planes" style="min-height:180px" placeholder="Estos son nuestros planes…">${esc(bot.planes || '')}</textarea></div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">📄 Términos y condiciones de contratación</h3>
        <p class="muted-sm">Cuando un cliente elige un plan, el bot recoge sus datos (nombre, RUT, teléfono, correo, dirección y foto del carnet) y le <b>envía el PDF de Términos y Condiciones</b> para que los <b>acepte</b> antes de finalizar.</p>
        <p class="muted-sm" style="margin-top:6px">📎 <b>El PDF actual ya está cargado en el bot.</b> Para cambiarlo, envíame el nuevo archivo y lo reemplazo.</p>
        <div class="field full" style="margin-top:8px">
          <label>Texto de respaldo (se usa solo si algún día no hay PDF cargado)</label>
          <textarea class="textarea" data-b="condiciones" style="min-height:110px" placeholder="Opcional: un resumen de las condiciones por si no hay PDF…">${esc(cond)}</textarea>
        </div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🕐 Horario de atención</h3>
        <label style="${sw};margin:6px 0 8px">
          <input type="checkbox" data-b="horario_activo" ${bh.activo ? 'checked' : ''} style="${cb}">
          <span><b>Avisar cuando el cliente escribe fuera de horario</b></span>
        </label>
        <div class="cfg-two">
          <div class="field"><label>Atención desde</label><input class="input" type="time" data-b="horario_desde" value="${esc(bh.desde || '09:00')}"></div>
          <div class="field"><label>Atención hasta</label><input class="input" type="time" data-b="horario_hasta" value="${esc(bh.hasta || '19:00')}"></div>
        </div>
        <div class="field full" style="margin-top:10px"><label>Mensaje fuera de horario</label>
          <textarea class="textarea" data-b="horario_mensaje" placeholder="Estamos fuera de horario…">${esc(bh.mensaje || '')}</textarea></div>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">📅 Confirmación automática de visitas</h3>
        <p class="muted-sm">El día <b>anterior</b> a la visita, a la hora que elijas, el bot le escribe al cliente por WhatsApp y le pide confirmar. Si responde <b>NO</b>, la visita se <b>cancela sola</b>; si responde <b>SÍ</b>, queda confirmada.</p>
        <label style="${sw};margin:12px 0 8px">
          <input type="checkbox" data-b="cv_activo" ${cvv.activo ? 'checked' : ''} style="${cb}">
          <span><b>Activar confirmación automática</b></span>
        </label>
        <div class="field" style="max-width:220px">
          <label>Hora de envío (el día anterior)</label>
          <input class="input" type="number" min="0" max="23" data-b="cv_hora" value="${esc(String(cvv.hora != null ? cvv.hora : 18))}">
        </div>
        <div class="field full" style="margin-top:10px">
          <label>Mensaje de confirmación</label>
          <textarea class="textarea" data-b="cv_mensaje" style="min-height:120px" placeholder="Hola {nombre}, ¿confirmas tu visita de mañana?…">${esc(cvv.mensaje || '')}</textarea>
          <p class="muted-sm" style="margin-top:6px">Puedes usar: <b>{nombre}</b> (nombre del cliente), <b>{fecha}</b> (día de la visita) y <b>{bloque}</b> (bloque horario). El cliente responde <b>SÍ</b> o <b>NO</b>.</p>
        </div>
        <p class="muted-sm" style="margin-top:8px">💡 Para probarlo sin esperar, abre una visita y usa el botón <b>“Pedir confirmación ahora”</b>. Y recuerda tener el <b>modo prueba apagado</b> (o el cliente de prueba desbloqueado) para que el bot procese su respuesta.</p>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🔔 Más avisos automáticos <span class="tag" style="margin-left:6px">Próximamente</span></h3>
        <ul class="muted-sm" style="margin:8px 0 0; padding-left:18px; line-height:1.7">
          <li>⏳ <b>Vencimiento de plan</b> — avisa al cliente cuando se acerca la fecha de vencimiento.</li>
          <li>💰 <b>Deuda</b> — le recuerda cuánto quedó debiendo.</li>
        </ul>
        <p class="muted-sm" style="margin-top:10px">Necesitan primero cargar los datos de facturación de cada cliente (plan, vencimiento y saldo).</p>
      </div>

      <div class="cfg-footbar">
        <button class="btn" data-back>← Volver a Configuración</button>
        <div class="grow"></div>
        <button class="btn btn-primary" data-savebot>Guardar cambios</button>
      </div>
    </div>`;

  root.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => renderConfig(root)));
  root.querySelector('[data-openflow]').onclick = () => renderFlowEditor(root);
  root.querySelector('[data-openbroadcast]').onclick = () => broadcastModal();

  const doSaveBot = async () => {
    const q = (sel) => root.querySelector(sel);
    const payload = {
      bot: {
        activo: q('[data-b="activo"]').checked,
        modo_prueba: q('[data-b="modo_prueba"]').checked,
        palabra_prueba: q('[data-b="palabra_prueba"]').value.trim() || 'paralelepipedo',
        saludo: q('[data-b="saludo"]').value.trim(),
        planes: q('[data-b="planes"]').value.trim(),
        horario: {
          activo: q('[data-b="horario_activo"]').checked,
          desde: q('[data-b="horario_desde"]').value || '09:00',
          hasta: q('[data-b="horario_hasta"]').value || '19:00',
          mensaje: q('[data-b="horario_mensaje"]').value.trim(),
        },
        confirma_visita: {
          activo: q('[data-b="cv_activo"]').checked,
          hora: parseInt(q('[data-b="cv_hora"]').value, 10) || 18,
          mensaje: q('[data-b="cv_mensaje"]').value.trim(),
        },
        condiciones: q('[data-b="condiciones"]').value.trim(),
      },
    };
    root.querySelectorAll('[data-savebot]').forEach((b) => { b.disabled = true; });
    try {
      await store.saveConfig(payload);
      toast('Configuración del bot guardada ✓');
      renderBotConfig(root);
    } catch (e) {
      toast(e.message || 'No se pudo guardar', 'info');
      root.querySelectorAll('[data-savebot]').forEach((b) => { b.disabled = false; });
    }
  };
  root.querySelectorAll('[data-savebot]').forEach((b) => (b.onclick = doSaveBot));
}

// ============================================================
// Editor visual del FLUJO del bot (menú → opciones → pasos)
// Se abre desde la configuración del Bot. Guarda en bot.flujo.
// ============================================================
/** Formato tipo WhatsApp: *negrita* _cursiva_ ~tachado~ y saltos de línea → HTML. */
function waFormat(t) {
  let h = esc(t || '');
  h = h.replace(/\*(.+?)\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/~(.+?)~/g, '<s>$1</s>');
  return h.replace(/\n/g, '<br>');
}
const DATO_HINT = { nombre: 'Nombre y apellido', ubicacion: 'Dirección o ubicación 📎', mensaje: 'Su respuesta / detalle', telefono: 'Un teléfono' };

function renderFlowEditor(root) {
  if (!store.isCoordinador()) { renderConfig(root); return; }
  const cfg = store.configFull() || {};
  const bot = cfg.bot || {};
  let model = flujoAModelo(bot.flujo);
  let openIdx = model.opciones.length ? 0 : -1; // acordeón: 1 opción abierta a la vez
  let dirty = false;
  const markDirty = () => { dirty = true; const b = root.querySelector('[data-dirty]'); if (b) b.style.display = ''; };

  const datoOptions = (sel) => DATOS.map((d) => `<option value="${d.v}"${d.v === sel ? ' selected' : ''}>${esc(d.l)}</option>`).join('');

  function menuText() {
    const nums = model.opciones.map((_, i) => i + 1);
    const rango = nums.length > 1 ? `${nums[0]} o ${nums[nums.length - 1]}` : (nums[0] || '1');
    const ops = model.opciones.map((o, i) => `*${i + 1}* · ${o.titulo || '(sin título)'}${o.desc ? `\n      ${o.desc}` : ''}`).join('\n\n');
    return `¡Hola! 👋 Bienvenido/a a *WIFIRED*.\n\n${(model.intro || '').trim()} Responde con *un solo número* (${rango}) 👇\n\n${ops}`;
  }
  // Burbujas de chat de una opción: menú → cliente elige N → cada pregunta/respuesta → confirmación.
  function chatBubbles(op, i) {
    const b = [];
    b.push(`<div class="wa-b wa-in">${waFormat(menuText())}</div>`);
    b.push(`<div class="wa-b wa-out">${i + 1}</div>`);
    op.pasos.forEach((p) => {
      if (p.pregunta) b.push(`<div class="wa-b wa-in">${waFormat(p.pregunta)}</div>`);
      b.push(`<div class="wa-b wa-out wa-ghost">${esc(DATO_HINT[p.dato] || 'Su respuesta')}</div>`);
    });
    if (op.confirma) b.push(`<div class="wa-b wa-in">${waFormat(op.confirma.replace(/\{num\}/g, '1042'))}</div>`);
    return `<div class="wa-phone"><div class="wa-head">🤖 Bot WIFIRED</div><div class="wa-body">${b.join('')}</div></div>`;
  }

  function opCard(op, i) {
    const abierto = i === openIdx;
    const resumen = `${op.pasos.length} ${op.pasos.length === 1 ? 'pregunta' : 'preguntas'}`;
    if (!abierto) return `
      <div class="flow-op card flow-op-closed">
        <div class="flow-op-head" data-toggle="${i}">
          <span class="flow-badge">${i + 1}</span>
          <div class="grow"><b>${esc(op.titulo || '(sin título)')}</b><div class="muted-sm">${resumen}</div></div>
          <span class="flow-caret">▸</span>
        </div>
      </div>`;
    const pasosHtml = op.pasos.map((p, j) => `
      <div class="flow-step">
        <div class="flow-step-top">
          <span class="flow-step-n">Paso ${j + 1} · pide:</span>
          <select class="input flow-dato" data-op="${i}" data-step="${j}">${datoOptions(p.dato)}</select>
          <div class="flow-step-btns">
            <button class="icon-btn" data-mv="up" data-op="${i}" data-step="${j}" title="Subir"${j === 0 ? ' disabled' : ''}>↑</button>
            <button class="icon-btn" data-mv="down" data-op="${i}" data-step="${j}" title="Bajar"${j === op.pasos.length - 1 ? ' disabled' : ''}>↓</button>
            <button class="icon-btn" data-delstep data-op="${i}" data-step="${j}" title="Quitar paso"${op.pasos.length <= 1 ? ' disabled' : ''}>✕</button>
          </div>
        </div>
        <textarea class="textarea flow-preg" data-op="${i}" data-step="${j}" placeholder="Escribe la pregunta que hace el bot…">${esc(p.pregunta)}</textarea>
      </div>`).join('');

    return `
      <div class="flow-op card flow-op-open">
        <div class="flow-op-head" data-toggle="${i}">
          <span class="flow-badge">${i + 1}</span>
          <div class="grow"><b>${esc(op.titulo || '(sin título)')}</b></div>
          <span class="flow-caret">▾</span>
        </div>
        <div class="field"><label>Título (lo que ve el cliente en el menú)</label>
          <input class="input flow-titulo" data-op="${i}" value="${esc(op.titulo)}" placeholder="Ej: Soporte técnico 🛠️"></div>
        <div class="field"><label>Descripción corta (debajo del título)</label>
          <input class="input flow-desc" data-op="${i}" value="${esc(op.desc)}" placeholder="Ej: Internet lento, cortes o cualquier falla."></div>
        <div class="flow-steps-label">Preguntas que hace el bot</div>
        <div class="flow-steps">${pasosHtml || '<p class="muted-sm">Sin preguntas aún.</p>'}</div>
        <button class="btn btn-sm" data-addstep data-op="${i}" style="margin-top:8px">＋ Agregar pregunta</button>
        <div class="field" style="margin-top:14px"><label>Mensaje final (al crear el ticket). <b>{num}</b> = N° de ticket.</label>
          <textarea class="textarea flow-confirma" data-op="${i}" placeholder="✅ ¡Listo! Registramos tu solicitud con el N° *{num}*…">${esc(op.confirma)}</textarea></div>
        <div class="flow-op-tools">
          <button class="btn btn-sm" data-opmv="up" data-op="${i}" title="Mover opción arriba"${i === 0 ? ' disabled' : ''}>↑ Subir</button>
          <button class="btn btn-sm" data-opmv="down" data-op="${i}" title="Mover opción abajo"${i === model.opciones.length - 1 ? ' disabled' : ''}>↓ Bajar</button>
          <button class="btn btn-sm" data-dupop data-op="${i}">⧉ Duplicar</button>
          <button class="btn btn-sm btn-danger" data-delop data-op="${i}"${model.opciones.length <= 1 ? ' disabled' : ''}>🗑 Quitar</button>
        </div>
        <div class="flow-preview"><div class="flow-preview-label">👁 Así lo ve el cliente</div>${chatBubbles(op, i)}</div>
      </div>`;
  }

  function paint() {
    root.innerHTML = `
      <div class="section-head">
        <div>
          <h2>🔀 Editor del flujo</h2>
          <span class="muted-sm">Toca una opción para editarla. Abajo ves cómo queda el chat.</span>
        </div>
        <div class="row" style="gap:8px">
          <span class="chip chip-warn" data-dirty style="display:none">● Sin guardar</span>
          <button class="btn" data-back>← Volver</button>
          <button class="btn btn-primary" data-saveflow>Guardar</button>
        </div>
      </div>

      <div class="cfg-wrap flow-wrap">
        <div class="card cfg-card">
          <h3 class="cfg-title">📋 Saludo del menú</h3>
          <div class="field full"><label>Frase de entrada</label>
            <textarea class="textarea" data-intro placeholder="Cuéntame en qué te puedo ayudar hoy.">${esc(model.intro)}</textarea></div>
        </div>

        <div class="flow-steps-label" style="margin:16px 0 6px">Opciones del menú</div>
        ${model.opciones.map((op, i) => opCard(op, i)).join('')}
        <button class="btn" data-addop style="margin-top:6px">＋ Agregar opción</button>

        <div class="card cfg-card" style="margin-top:22px">
          <h3 class="cfg-title">🔒 Contratación (fijo)</h3>
          <p class="muted-sm">Al elegir un plan, el bot pide RUT, correo, fotos del carnet y aceptación de condiciones. Ese tramo es <b>fijo</b> por seguridad legal; los textos de planes y condiciones se editan en las otras tarjetas del bot.</p>
        </div>

        <div class="cfg-footbar">
          <button class="btn" data-restore>↺ Restaurar por defecto</button>
          <div class="grow"></div>
          <button class="btn btn-primary" data-saveflow>Guardar</button>
        </div>
      </div>`;
    if (dirty) { const d = root.querySelector('[data-dirty]'); if (d) d.style.display = ''; }
    bind();
  }

  function refreshChat(i) {
    if (i !== openIdx) return;
    const card = root.querySelectorAll('.flow-op')[i];
    const box = card && card.querySelector('.flow-preview');
    if (box) box.innerHTML = `<div class="flow-preview-label">👁 Así lo ve el cliente</div>${chatBubbles(model.opciones[i], i)}`;
  }

  function bind() {
    root.querySelector('[data-back]').onclick = () => { if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir igual?')) return; renderBotConfig(root); };
    root.querySelectorAll('[data-toggle]').forEach((h) => (h.onclick = (e) => { if (e.target.closest('input,textarea,select,button')) return; const i = +h.dataset.toggle; openIdx = openIdx === i ? -1 : i; paint(); }));

    const intro = root.querySelector('[data-intro]');
    if (intro) intro.oninput = () => { model.intro = intro.value; markDirty(); refreshChat(openIdx); };

    root.querySelectorAll('.flow-titulo').forEach((el) => (el.oninput = () => { const i = +el.dataset.op; model.opciones[i].titulo = el.value; markDirty(); refreshChat(i); }));
    root.querySelectorAll('.flow-desc').forEach((el) => (el.oninput = () => { const i = +el.dataset.op; model.opciones[i].desc = el.value; markDirty(); refreshChat(i); }));
    root.querySelectorAll('.flow-confirma').forEach((el) => (el.oninput = () => { const i = +el.dataset.op; model.opciones[i].confirma = el.value; markDirty(); refreshChat(i); }));
    root.querySelectorAll('.flow-preg').forEach((el) => (el.oninput = () => { const i = +el.dataset.op; model.opciones[i].pasos[+el.dataset.step].pregunta = el.value; markDirty(); refreshChat(i); }));
    root.querySelectorAll('.flow-dato').forEach((el) => (el.onchange = () => { const i = +el.dataset.op; model.opciones[i].pasos[+el.dataset.step].dato = el.value; markDirty(); refreshChat(i); }));

    root.querySelectorAll('[data-addstep]').forEach((b) => (b.onclick = () => { model.opciones[+b.dataset.op].pasos.push({ dato: 'nombre', pregunta: '' }); markDirty(); paint(); }));
    root.querySelectorAll('[data-delstep]').forEach((b) => (b.onclick = () => { model.opciones[+b.dataset.op].pasos.splice(+b.dataset.step, 1); markDirty(); paint(); }));
    root.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.op, j = +b.dataset.step, arr = model.opciones[i].pasos;
      const k = b.dataset.mv === 'up' ? j - 1 : j + 1;
      if (k < 0 || k >= arr.length) return;
      [arr[j], arr[k]] = [arr[k], arr[j]]; markDirty(); paint();
    }));
    root.querySelectorAll('[data-opmv]').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.op, k = b.dataset.opmv === 'up' ? i - 1 : i + 1, arr = model.opciones;
      if (k < 0 || k >= arr.length) return;
      [arr[i], arr[k]] = [arr[k], arr[i]]; openIdx = k; markDirty(); paint();
    }));
    root.querySelectorAll('[data-dupop]').forEach((b) => (b.onclick = () => { const i = +b.dataset.op; model.opciones.splice(i + 1, 0, JSON.parse(JSON.stringify(model.opciones[i]))); openIdx = i + 1; markDirty(); paint(); }));
    root.querySelectorAll('[data-delop]').forEach((b) => (b.onclick = () => { const i = +b.dataset.op; model.opciones.splice(i, 1); if (openIdx >= model.opciones.length) openIdx = model.opciones.length - 1; markDirty(); paint(); }));
    root.querySelector('[data-addop]').onclick = () => { model.opciones.push({ titulo: '', categoria: '', desc: '', confirma: '✅ ¡Listo! Registramos tu solicitud con el N° *{num}*. Te contactaremos pronto. 🙌', pasos: [{ dato: 'nombre', pregunta: '¿Cuál es tu *nombre completo*?' }] }); openIdx = model.opciones.length - 1; markDirty(); paint(); };
    root.querySelector('[data-restore]').onclick = () => { if (!confirm('¿Restaurar el flujo de fábrica? Perderás los cambios.')) return; model = JSON.parse(JSON.stringify(DEFAULT_FLUJO_APP)); openIdx = 0; markDirty(); paint(); toast('Flujo restaurado. Recuerda Guardar.', 'info'); };

    root.querySelectorAll('[data-saveflow]').forEach((b) => (b.onclick = () => doSave()));
  }

  async function doSave() {
    const flujo = modeloAFlujo(model);
    if (!flujo.opciones.length) { toast('Deja al menos una opción con título y una pregunta', 'info'); return; }
    for (const op of flujo.opciones) {
      if (!op.confirma) { toast(`La opción "${op.titulo}" necesita un mensaje final`, 'info'); return; }
    }
    root.querySelectorAll('[data-saveflow]').forEach((b) => { b.disabled = true; });
    try {
      await store.saveConfig({ bot: { flujo } });
      dirty = false; const d = root.querySelector('[data-dirty]'); if (d) d.style.display = 'none';
      toast('Flujo guardado ✓ — el bot lo usará en menos de 1 minuto');
    } catch (e) {
      toast(e.message || 'No se pudo guardar', 'info');
    }
    root.querySelectorAll('[data-saveflow]').forEach((b) => { b.disabled = false; });
  }

  paint();
}
