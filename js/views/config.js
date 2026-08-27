// ============================================================
// WIFIRED · Vista Configuración (sólo coordinación)
// Edita las listas del formulario de visitas (tipos, bloques,
// estados, prioridades, nodos) y los datos de la empresa para
// la orden de trabajo.
// ============================================================
import * as store from '../store.js';
import { esc, toast, bindField, validaEmail } from '../util.js';
import { openModal, closeModal } from '../components.js';
import { broadcastModal, contactosModal } from './servicios.js';


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
        <h3 class="cfg-title">🔐 Seguridad · Mi contraseña</h3>
        <p class="muted-sm">Cambia la contraseña con la que entras a la app. Hazlo sobre todo si todavía usas la de fábrica. Mínimo 6 caracteres.</p>
        <div class="form-grid" style="margin-top:8px">
          <div class="field"><label>Contraseña actual</label><input class="input" type="password" data-pw="actual" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña</label><input class="input" type="password" data-pw="nueva" autocomplete="new-password"></div>
          <div class="field"><label>Repetir nueva</label><input class="input" type="password" data-pw="rep" autocomplete="new-password"></div>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary" data-savepw>Cambiar contraseña</button></div>
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

  // Cambiar mi contraseña
  root.querySelector('[data-savepw]').onclick = async (e) => {
    const g = (k) => (root.querySelector(`[data-pw="${k}"]`).value || '');
    const actual = g('actual'), nueva = g('nueva'), rep = g('rep');
    if (!actual) { toast('Escribe tu contraseña actual', 'info'); return; }
    if (nueva.length < 6) { toast('La nueva contraseña debe tener al menos 6 caracteres', 'info'); return; }
    if (nueva !== rep) { toast('Las contraseñas nuevas no coinciden', 'info'); return; }
    const btn = e.currentTarget; btn.disabled = true;
    try {
      await store.cambiarClave(actual, nueva);
      toast('Contraseña cambiada ✓');
      ['actual', 'nueva', 'rep'].forEach((k) => { root.querySelector(`[data-pw="${k}"]`).value = ''; });
    } catch (err) { toast(err.message || 'No se pudo cambiar', 'info'); }
    btn.disabled = false;
  };

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
        <h3 class="cfg-title">📍 Nodos que atiende el bot</h3>
        <p class="muted-sm">Marca los nodos cuyos clientes quieres que atienda el bot. Si <b>no marcas ninguno</b>, atiende a <b>todos</b>. Con nodos marcados, el bot <b>solo responde a los números de clientes de esos nodos</b> (el resto los ignora).</p>
        ${(Array.isArray(cfg.nodos) && cfg.nodos.length) ? `
          <div style="margin-top:10px">
            ${cfg.nodos.map((n) => `<label style="${sw};margin:6px 0"><input type="checkbox" data-nodo="${esc(n)}" ${(Array.isArray(bot.nodos) && bot.nodos.includes(n)) ? 'checked' : ''} style="${cb}"><span>${esc(n)}</span></label>`).join('')}
          </div>` : `<p class="muted-sm" style="margin-top:8px">⚠️ Aún no tienes nodos creados. Créalos en <b>Configuración → Nodos</b> y asigna el nodo a cada cliente en <b>Servicios</b>.</p>`}
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">🔀 Menú del bot (fijo)</h3>
        <p class="muted-sm">El recorrido del bot está definido y probado en el sistema. Ofrece estas opciones a los clientes:</p>
        <ul class="muted-sm" style="margin:8px 0 0;padding-left:18px;line-height:1.8">
          <li>1 · Problema técnico 🛠️</li>
          <li>2 · Planes y contratación 📶</li>
          <li>3 · Cancelar servicio / Retiro de equipos 📦</li>
          <li>4 · Enviar comprobante de pago 💳</li>
        </ul>
        <p class="muted-sm" style="margin-top:8px">Si necesitas cambiar estas opciones o sus preguntas, pídeselo al equipo de desarrollo.</p>
      </div>

      <div class="card cfg-card">
        <h3 class="cfg-title">✉️ Envío masivo de WhatsApp</h3>
        <p class="muted-sm">Envía un mensaje a todos los clientes de un <b>nodo</b> (o a todos). El bot los manda de a uno con pausa (8–20 seg) para no arriesgar el número.</p>
        <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-primary" data-openbroadcast>✉️ Redactar envío masivo →</button>
          <button class="btn" data-opencontactos>👥 Ver contactos (opt-in / BAJA)</button>
        </div>
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
  root.querySelector('[data-openbroadcast]').onclick = () => broadcastModal();
  root.querySelector('[data-opencontactos]').onclick = () => contactosModal();

  const doSaveBot = async () => {
    const q = (sel) => root.querySelector(sel);
    const payload = {
      bot: {
        activo: q('[data-b="activo"]').checked,
        modo_prueba: q('[data-b="modo_prueba"]').checked,
        palabra_prueba: q('[data-b="palabra_prueba"]').value.trim() || 'paralelepipedo',
        nodos: Array.from(root.querySelectorAll('[data-nodo]:checked')).map((el) => el.dataset.nodo),
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

