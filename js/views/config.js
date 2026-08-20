// ============================================================
// WIFIRED · Vista Configuración (sólo coordinación)
// Edita las listas del formulario de visitas (tipos, bloques,
// estados, prioridades, nodos) y los datos de la empresa para
// la orden de trabajo.
// ============================================================
import * as store from '../store.js';
import { esc, toast, bindField, validaEmail } from '../util.js';
import { openModal, closeModal } from '../components.js';

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
  const bh = bot.horario || {};

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
        <p class="muted-sm">El asistente que responde a los clientes por WhatsApp y crea tickets. Estos textos los usa el bot sin que tengas que tocar código. (Requiere tener el bot conectado en el servidor.)</p>
        <label style="display:flex;align-items:center;gap:10px;margin:12px 0;cursor:pointer">
          <input type="checkbox" data-bot="activo" ${bot.activo !== false ? 'checked' : ''} style="width:18px;height:18px">
          <span><b>Bot activo</b> — responde automáticamente a los clientes</span>
        </label>
        <div class="field full"><label>Saludo del menú (primera frase que ve el cliente)</label>
          <textarea class="textarea" data-bot="saludo" placeholder="Soy el asistente virtual…">${esc(bot.saludo || '')}</textarea></div>
        <div class="field full" style="margin-top:12px"><label>Texto de los planes (se envía al cliente con el botón “Enviar planes por WhatsApp”)</label>
          <textarea class="textarea" data-bot="planes" style="min-height:130px" placeholder="Estos son nuestros planes…">${esc(bot.planes || '')}</textarea></div>

        <label style="display:flex;align-items:center;gap:10px;margin:16px 0 8px;cursor:pointer">
          <input type="checkbox" data-bot="horario_activo" ${bh.activo ? 'checked' : ''} style="width:18px;height:18px">
          <span><b>Avisar cuando el cliente escribe fuera de horario</b></span>
        </label>
        <div class="cfg-two">
          <div class="field"><label>Atención desde</label><input class="input" type="time" data-bot="horario_desde" value="${esc(bh.desde || '09:00')}"></div>
          <div class="field"><label>Atención hasta</label><input class="input" type="time" data-bot="horario_hasta" value="${esc(bh.hasta || '19:00')}"></div>
        </div>
        <div class="field full" style="margin-top:10px"><label>Mensaje fuera de horario</label>
          <textarea class="textarea" data-bot="horario_mensaje" placeholder="Estamos fuera de horario…">${esc(bh.mensaje || '')}</textarea></div>
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
      bot: {
        activo: root.querySelector('[data-bot="activo"]').checked,
        saludo: root.querySelector('[data-bot="saludo"]').value.trim(),
        planes: root.querySelector('[data-bot="planes"]').value.trim(),
        horario: {
          activo: root.querySelector('[data-bot="horario_activo"]').checked,
          desde: root.querySelector('[data-bot="horario_desde"]').value || '09:00',
          hasta: root.querySelector('[data-bot="horario_hasta"]').value || '19:00',
          mensaje: root.querySelector('[data-bot="horario_mensaje"]').value.trim(),
        },
      },
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
