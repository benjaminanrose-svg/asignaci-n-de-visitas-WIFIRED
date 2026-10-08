// ============================================================
// WIFIRED · Vista Configuración (sólo coordinación)
// Edita las listas del formulario de visitas (tipos, bloques,
// estados, prioridades, nodos) y los datos de la empresa para
// la orden de trabajo.
// ============================================================
import * as store from '../store.js';
import { esc, toast, bindField, validaEmail, zonaDeNodo, ZONAS, parseTecnico, fmtDateShort, todayISO, parseDate } from '../util.js';
import { openModal, closeModal, claveTemporalModal, visitDetailModal, workOrderModal, statusBadge } from '../components.js';
import { visitFormModal } from '../form.js';
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

// Insignia de zona para el panel de nodos (según zona actual del nodo).
function zonaBadgeCfg(nodo) {
  const z = zonaDeNodo(nodo);
  if (!z) return '<span class="zona-badge" style="color:var(--text-3)">Sin zona</span>';
  return `<span class="zona-badge" data-nodozona-badge style="color:${z.color};border-color:color-mix(in srgb, ${z.color} 45%, var(--border));background:color-mix(in srgb, ${z.color} 15%, transparent)">📍 ${z.label}</span>`;
}
// Fila del panel "Zona de cada nodo": nombre + insignia + selector.
function nodoZonaRow(nodo) {
  const z = zonaDeNodo(nodo);
  const k = z ? z.key : 'melipilla'; // por defecto Melipilla si no se sabe
  return `
    <div class="cfg-nodo-row">
      <span class="cfg-nodo-name">${esc(nodo)}</span>
      ${zonaBadgeCfg(nodo)}
      <select class="select cfg-nodo-sel" data-nodozona="${esc(nodo)}">
        <option value="Melipilla" ${k === 'melipilla' ? 'selected' : ''}>📍 Melipilla</option>
        <option value="Paine" ${k === 'paine' ? 'selected' : ''}>📍 Paine</option>
      </select>
    </div>`;
}
// Recoge la zona elegida por nodo. Garantiza zona para todo nodo (nunca vacío).
function collectNodosZona(root, nodos) {
  const out = {};
  root.querySelectorAll('[data-nodozona]').forEach((sel) => { if (sel.value) out[sel.dataset.nodozona] = sel.value; });
  (nodos || []).forEach((n) => { if (!out[n]) { const z = zonaDeNodo(n); out[n] = z ? z.label : 'Melipilla'; } });
  return out;
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
  const otIni = cfg.otInicio || {};

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>⚙️ Configuración</h2>
        <span class="muted-sm">Personaliza lo que aparece al agendar y los datos de la empresa</span>
      </div>
      <button class="btn btn-primary" data-save>Guardar cambios</button>
    </div>

    <div class="cfg-tabs" role="tablist">
      <button class="cfg-tab is-on" data-tab="empresa">🏢 Empresa y General</button>
      <button class="cfg-tab" data-tab="red">📡 Red y Nodos</button>
      <button class="cfg-tab" data-tab="agenda">📅 Agendamiento</button>
      <button class="cfg-tab" data-tab="sistema">🤖 Sistema e Integraciones</button>
      <button class="cfg-tab" data-tab="seguimiento">⏰ Seguimiento <span class="tab-badge" data-venc-badge hidden></span></button>
    </div>
    <div class="cfg-wrap">
      <div class="card cfg-card" data-group="empresa">
        <h3 class="cfg-title">🧾 Datos de la empresa (orden de trabajo)</h3>
        <div class="form-grid">
          <div class="field full"><label>Nombre / Razón social</label><input class="input" data-emp="nombre" value="${esc(emp.nombre || '')}"></div>
          <div class="field full"><label>Dirección</label><input class="input" data-emp="direccion" value="${esc(emp.direccion || '')}"></div>
          <div class="field full"><label>Teléfonos (separados por coma)</label><input class="input" data-emp="fonos" value="${esc(fonos)}" placeholder="569 1234 5678, 569 8765 4321"></div>
          <div class="field"><label>Correo de contacto</label><input class="input" data-emp="email" value="${esc(emp.email || '')}"></div>
          <div class="field"><label>Trabajos autorizados por</label><input class="input" data-emp="autoriza" value="${esc(emp.autoriza || '')}"></div>
        </div>
      </div>

      <div class="card cfg-card" data-group="empresa">
        <h3 class="cfg-title">📧 Avisos automáticos al cliente</h3>
        <p class="muted-sm">Cuando está encendido, el cliente recibe por correo un aviso al agendarse su visita y un recordatorio el día antes. Requiere tener el correo configurado en el servidor y que la visita tenga correo del cliente.</p>
        <label class="cfg-switch" style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer">
          <input type="checkbox" data-avisos ${avisos ? 'checked' : ''} style="width:18px;height:18px">
          <span><b>Enviar avisos y recordatorios al cliente</b></span>
        </label>
      </div>

${bot.solo_comunicados !== false ? `
      <div class="card cfg-card" data-group="sistema">
        <h3 class="cfg-title">📣 Comunicados masivos por WhatsApp</h3>
        <p class="muted-sm">El bot está en modo <b>solo comunicados</b>: envía los mensajes masivos (a todos o por nodo) y atiende las respuestas <b>BAJA / ALTA</b>. No responde menú, tickets, planes ni confirmaciones.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center">
          <button class="btn btn-primary" data-solo-broadcast>✉️ Redactar comunicado</button>
          <button class="btn" data-solo-contactos>👥 Contactos y bajas</button>
          <div class="grow"></div>
          <button class="btn btn-sm" data-reactivar-bot>Reactivar todas las funciones del bot</button>
        </div>
      </div>` : `
      <div class="card cfg-card" data-group="sistema">
        <h3 class="cfg-title">🤖 Bot de WhatsApp</h3>
        <p class="muted-sm">El asistente que atiende a tus clientes por WhatsApp: menú, tickets, planes, horario y (pronto) avisos automáticos. Tiene su propia sección para no mezclarla con el resto.</p>
        <div class="row" style="align-items:center; gap:8px; flex-wrap:wrap; margin-top:12px">
          <span class="tag" style="background:color-mix(in srgb, ${bot.activo !== false ? '#10b981' : '#94a3b8'} 16%, transparent); color:${bot.activo !== false ? '#10b981' : '#94a3b8'}; border-color:color-mix(in srgb, ${bot.activo !== false ? '#10b981' : '#94a3b8'} 40%, var(--border))">${bot.activo !== false ? '🟢 Activo' : '⚪ Inactivo'}</span>
          ${bot.modo_prueba !== false ? '<span class="tag">🧪 En modo prueba</span>' : ''}
          <div class="grow"></div>
          <button class="btn btn-sm" data-solo-on>📣 Volver a solo comunicados</button>
          <button class="btn btn-primary" data-openbot>⚙️ Abrir configuración del Bot →</button>
        </div>
      </div>`}

      <div class="card cfg-card" data-group="empresa">
        <h3 class="cfg-title">🔐 Seguridad · Mi contraseña</h3>
        <p class="muted-sm">Cambia la contraseña con la que entras a la app. Mínimo 8 caracteres, con letras y números. Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
        <div class="form-grid" style="margin-top:8px">
          <div class="field"><label>Contraseña actual</label><input class="input" type="password" data-pw="actual" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña</label><input class="input" type="password" data-pw="nueva" autocomplete="new-password"></div>
          <div class="field"><label>Repetir nueva</label><input class="input" type="password" data-pw="rep" autocomplete="new-password"></div>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary" data-savepw>Cambiar contraseña</button></div>
      </div>

      <div class="card cfg-card" data-group="empresa">
        <h3 class="cfg-title">👥 Cuentas de coordinación</h3>
        <p class="muted-sm">Cada coordinador entra con su propio usuario: así el historial muestra quién hizo cada cosa. Las claves se guardan cifradas y nadie puede verlas; si alguien la olvida, se restablece.</p>
        <div data-coords><p class="muted-sm">Cargando…</p></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" data-coord-new>＋ Nuevo coordinador</button></div>
      </div>

      <div class="card cfg-card" data-group="seguimiento" hidden>
        <h3 class="cfg-title">⏰ Visitas activas vencidas</h3>
        <p class="muted-sm">Visitas que siguen <b>Pendientes, Programadas o Reprogramadas</b> aunque su fecha ya pasó. Casi siempre es porque el técnico olvidó marcarlas como completadas. Ábrelas para revisarlas, completarlas o reagendarlas.</p>
        <div class="row" style="gap:8px;margin:10px 0 4px;flex-wrap:wrap"><span class="muted-sm">Antigüedad mínima:</span>
          <div class="seg">${[1, 7, 15, 30].map((d) => `<button class="seg-btn${d === vencDias ? ' active' : ''}" data-venc-dias="${d}">${d === 1 ? 'Desde ayer' : d + ' días'}</button>`).join('')}</div>
        </div>
        <div data-vencidas></div>
      </div>

      <div class="card cfg-card" data-group="red">
        <h3 class="cfg-title">🛠 Tipos de servicio</h3>
        <p class="muted-sm">Aparecen en “Tipo de visita” al agendar.</p>
        ${listEditor('tipos', cfg.tipos)}
      </div>

      <div class="card cfg-card" data-group="agenda">
        <h3 class="cfg-title">🕐 Bloques horarios</h3>
        ${listEditor('bloques', cfg.bloques)}
      </div>

      <div class="cfg-two" data-group="agenda">
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

      <div class="card cfg-card" data-group="red">
        <h3 class="cfg-title">📡 Nodos</h3>
        <p class="muted-sm">Los nodos (zonas / puntos de red) que se pueden asignar a cada visita. Se usan para las estadísticas por nodo del panel.</p>
        ${listEditor('nodos', cfg.nodos)}
        <h4 class="cfg-subtitle" style="margin:16px 0 4px">📍 Zona / comuna de cada nodo</h4>
        <p class="muted-sm">Define a qué comuna pertenece cada nodo. Esto pinta los colores del Calendario y alimenta los filtros por zona.</p>
        <div class="cfg-nodozona" data-nodozona-list>
          ${(cfg.nodos || []).length
            ? cfg.nodos.map((n) => nodoZonaRow(n)).join('')
            : '<p class="muted-sm">Crea primero un nodo arriba para asignarle su zona.</p>'}
        </div>
        <h4 class="cfg-subtitle" style="margin:18px 0 4px">🔢 Próximo N° de OT por zona</h4>
        <p class="muted-sm">Normalmente déjalo en <b>0</b>: el número sigue solo. Pon un número
        únicamente si necesitas <b>reiniciar</b> la cuenta o continuar desde otro valor. Si el
        número que pongas ya existe, se usa el siguiente libre (nunca se repite una OT).</p>
        <div class="form-grid">
          <div class="field"><label>📍 Melipilla · <code>OT-MEL-2026-…</code></label>
            <input class="input" type="number" min="0" step="1" data-ot="MEL" value="${esc(String(otIni.MEL || 0))}"></div>
          <div class="field"><label>📍 Paine · <code>OT-PAIN-2026-…</code></label>
            <input class="input" type="number" min="0" step="1" data-ot="PAIN" value="${esc(String(otIni.PAIN || 0))}"></div>
        </div>
      </div>

      <div class="card cfg-card" data-group="sistema">
        <h3 class="cfg-title">💾 Respaldo de datos</h3>
        <p class="muted-sm">Descarga una copia de seguridad completa (clientes, visitas, asignaciones, estados y configuración) en un archivo. Guárdala en tu computador, Google Drive o un pendrive. El servidor también genera un respaldo automático cada madrugada.</p>
        <button class="btn" data-backup style="margin-top:10px">⭳ Descargar respaldo completo ahora</button>
      </div>

      <div class="card cfg-card cfg-danger" data-group="sistema">
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

  // Cambio rápido de zona de un nodo: actualiza su insignia al instante.
  root.querySelectorAll('[data-nodozona]').forEach((sel) => (sel.onchange = () => {
    const badge = sel.parentElement.querySelector('.zona-badge');
    const z = sel.value.toLowerCase().includes('paine') ? ZONAS.paine : ZONAS.melipilla;
    if (badge) {
      badge.textContent = `📍 ${z.label}`;
      badge.style.color = z.color;
      badge.style.borderColor = `color-mix(in srgb, ${z.color} 45%, var(--border))`;
      badge.style.background = `color-mix(in srgb, ${z.color} 15%, transparent)`;
    }
  }));

  // Pestañas: muestra solo el grupo activo. Todos los inputs siguen en el DOM,
  // así el "Guardar cambios" global no pierde nada al cambiar de pestaña.
  const tabBtns = root.querySelectorAll('.cfg-tab');
  const setTab = (tab) => {
    tabBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
    root.querySelectorAll('[data-group]').forEach((el) => { el.hidden = el.dataset.group !== tab; });
  };
  tabBtns.forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  setTab('empresa');

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
  const obBtn = root.querySelector('[data-openbot]');
  if (obBtn) obBtn.onclick = () => renderBotConfig(root);
  // Modo "solo comunicados" del bot
  const sbBtn = root.querySelector('[data-solo-broadcast]');
  if (sbBtn) sbBtn.onclick = () => broadcastModal();
  const scBtn = root.querySelector('[data-solo-contactos]');
  if (scBtn) scBtn.onclick = () => contactosModal();
  const setSolo = async (on) => {
    try { await store.saveConfig({ bot: { solo_comunicados: on } }); toast(on ? 'Bot en modo solo comunicados ✓' : 'Bot reactivado ✓'); renderConfig(root); }
    catch (e) { toast(e.message || 'No se pudo guardar', 'info'); }
  };
  const rbBtn = root.querySelector('[data-reactivar-bot]');
  if (rbBtn) rbBtn.onclick = () => { if (confirm('¿Reactivar el bot completo? Volverá a responder el menú, tickets y confirmaciones según su configuración.')) setSolo(false); };
  const soBtn = root.querySelector('[data-solo-on]');
  if (soBtn) soBtn.onclick = () => setSolo(true);
  // Cuentas de coordinación
  pintarCoords(root);
  pintarVencidas(root);
  root.querySelectorAll('[data-venc-dias]').forEach((b) => (b.onclick = () => {
    vencDias = Number(b.dataset.vencDias);
    root.querySelectorAll('[data-venc-dias]').forEach((x) => x.classList.toggle('active', x === b));
    pintarVencidas(root);
  }));
  // Se actualiza sola si una visita cambia (ej. la completas desde el detalle)
  if (unsubVenc) unsubVenc();
  unsubVenc = store.subscribe(() => {
    if (!root.querySelector('[data-vencidas]')) { if (unsubVenc) unsubVenc(); unsubVenc = null; return; }
    pintarVencidas(root);
  });
  const ncBtn = root.querySelector('[data-coord-new]');
  if (ncBtn) ncBtn.onclick = () => nuevoCoordModal(root);

  // Cambiar mi contraseña
  root.querySelector('[data-savepw]').onclick = async (e) => {
    const g = (k) => (root.querySelector(`[data-pw="${k}"]`).value || '');
    const actual = g('actual'), nueva = g('nueva'), rep = g('rep');
    if (!actual) { toast('Escribe tu contraseña actual', 'info'); return; }
    if (nueva.length < 8 || !/[a-zA-Z]/.test(nueva) || !/[0-9]/.test(nueva)) { toast('La nueva contraseña debe tener al menos 8 caracteres, con letras y números', 'info'); return; }
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
    payload.nodosZona = collectNodosZona(root, payload.nodos);
    const otNum = (k) => { const el = root.querySelector(`[data-ot="${k}"]`); const v = parseInt(el ? el.value : 0, 10); return Number.isFinite(v) && v > 0 ? v : 0; };
    payload.otInicio = { MEL: otNum('MEL'), PAIN: otNum('PAIN') };
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

// ── Cuentas de coordinación ──────────────────────────────────────────────────
async function pintarCoords(root) {
  const el = root.querySelector('[data-coords]');
  if (!el) return;
  let list = [];
  try { list = await store.listUsuarios(); } catch (e) { el.innerHTML = `<p class="muted-sm">No se pudo cargar: ${esc(e.message || '')}</p>`; return; }
  el.innerHTML = list.length ? `<div class="coord-list">${list.map((u) => `
    <div class="coord-row ${u.activo ? '' : 'off'}">
      <div class="coord-main"><b>${esc(u.nombre)}</b>${u.yo ? ' <span class="tag">tú</span>' : ''}${u.activo ? '' : ' <span class="tag">Desactivado</span>'}${u.debe_cambiar ? ' <span class="tag">Debe crear su clave</span>' : ''}<div class="muted-sm">👤 ${esc(u.username)}</div></div>
      <div class="coord-acts">${u.yo ? '' : `
        <button class="btn btn-sm" data-cr="${u.id}">🔑 Restablecer clave</button>
        <button class="btn btn-sm" data-cs="${u.id}">⏏ Cerrar sesiones</button>
        <button class="btn btn-sm" data-ca="${u.id}" data-on="${u.activo ? 0 : 1}">${u.activo ? '⏸ Desactivar' : '▶ Activar'}</button>
        <button class="btn btn-sm btn-danger" data-cd="${u.id}" title="Eliminar cuenta">🗑</button>`}</div>
    </div>`).join('')}</div>` : '<p class="muted-sm">Sin cuentas.</p>';
  const run = async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e.message || 'No se pudo', 'info'); return null; }
    finally { pintarCoords(root); }
  };
  const find = (id) => list.find((u) => String(u.id) === String(id)) || {};
  el.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = async () => {
    const u = find(b.dataset.cr);
    if (!confirm(`¿Restablecer la clave de ${u.nombre}? Se cerrarán sus sesiones y deberá crear una nueva al entrar.`)) return;
    const r = await run(() => store.restablecerClaveUsuario(u.id));
    if (r && r.clave_temporal) claveTemporalModal(u.nombre, r.username, r.clave_temporal);
  }));
  el.querySelectorAll('[data-cs]').forEach((b) => (b.onclick = () => { const u = find(b.dataset.cs); if (confirm(`¿Cerrar todas las sesiones abiertas de ${u.nombre}?`)) run(() => store.cerrarSesionesUsuario(u.id), 'Sesiones cerradas ✓'); }));
  el.querySelectorAll('[data-ca]').forEach((b) => (b.onclick = () => { const u = find(b.dataset.ca); const on = b.dataset.on === '1'; if (on || confirm(`¿Desactivar a ${u.nombre}? No podrá entrar hasta que lo actives.`)) run(() => store.updateUsuario(u.id, { activo: on }), on ? 'Activado ✓' : 'Desactivado ✓'); }));
  el.querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => { const u = find(b.dataset.cd); if (confirm(`¿Eliminar la cuenta de ${u.nombre}? No se puede deshacer.`)) run(() => store.deleteUsuario(u.id), 'Cuenta eliminada'); }));
}
function nuevoCoordModal(root) {
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>👥 Nuevo coordinador</h3><button class="icon-btn" data-x>✕</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>Nombre *</label><input class="input" data-n placeholder="Ej: María González" autocomplete="off"></div>
      <div class="field full"><label>Usuario (opcional)</label><input class="input" data-u placeholder="Se genera solo: maria.gonzalez" autocomplete="off"></div>
    </div><p class="muted-sm" style="margin-top:8px">Se creará una <b>clave temporal</b> que verás una sola vez. Al entrar, deberá crear su propia clave.</p></div>
    <div class="modal-foot"><button class="btn" data-x2>Cancelar</button><button class="btn btn-primary" data-ok>Crear cuenta</button></div>`;
  node.querySelector('[data-x]').onclick = closeModal;
  node.querySelector('[data-x2]').onclick = closeModal;
  node.querySelector('[data-ok]').onclick = async (e) => {
    const nombre = node.querySelector('[data-n]').value.trim();
    const username = node.querySelector('[data-u]').value.trim().toLowerCase();
    if (!nombre) { toast('Escribe el nombre', 'info'); return; }
    const btn = e.currentTarget; btn.disabled = true;
    try { const r = await store.addUsuario({ nombre, username }); closeModal(); claveTemporalModal(r.nombre, r.username, r.clave_temporal); pintarCoords(root); }
    catch (err) { toast(err.message || 'No se pudo crear', 'info'); btn.disabled = false; }
  };
  openModal(node, 'md', { dismissable: false });
}


// ---------- Seguimiento: visitas activas vencidas ----------
let vencDias = 1;
let unsubVenc = null;
function visitasVencidas(dias) {
  const hoy = parseDate(todayISO());
  return store.visitas()
    .filter((v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado) && v.fecha)
    .map((v) => { const d = parseDate(v.fecha); return { v, dias: d ? Math.floor((hoy - d) / 86400000) : -1 }; })
    .filter((x) => x.dias >= dias)
    .sort((a, b) => b.dias - a.dias);
}
function pintarVencidas(root) {
  const box = root.querySelector('[data-vencidas]');
  if (!box) return;
  const lista = visitasVencidas(vencDias);
  const badge = root.querySelector('[data-venc-badge]');
  const totalBadge = visitasVencidas(1).length;
  if (badge) { badge.hidden = !totalBadge; badge.textContent = totalBadge; }
  if (!lista.length) { box.innerHTML = `<p class="muted" style="padding:14px 0">✅ No hay visitas activas ${vencDias === 1 ? 'con fecha pasada' : `con más de ${vencDias} días de antigüedad`}.</p>`; return; }
  const grupos = {};
  lista.forEach((x) => { const k = x.v.tecnico || ''; (grupos[k] = grupos[k] || []).push(x); });
  const orden = Object.keys(grupos).sort((a, b) => grupos[b].length - grupos[a].length);
  box.innerHTML = `<p class="muted-sm" style="margin:6px 0 10px"><b>${lista.length}</b> visita${lista.length === 1 ? '' : 's'} vencida${lista.length === 1 ? '' : 's'} · toca una para abrirla</p>` +
    orden.map((k) => `
      <div class="venc-grupo">
        <div class="venc-tec"><b>${esc(k ? parseTecnico(k).short : 'Sin técnico asignado')}</b><span class="tab-badge">${grupos[k].length}</span></div>
        ${grupos[k].map(({ v, dias }) => `
          <div class="venc-row">
            <button class="venc-open" data-venc-open="${esc(v._uid)}" title="Ver detalle">
              <span class="venc-main"><span class="cell-strong truncate">${esc(v.cliente || 'Sin nombre')}</span>
                <span class="cell-sub truncate">${esc([v.ot, v.tipo, v.nodo].filter(Boolean).join(' · ') || '—')}</span></span>
              <span class="venc-side"><span class="venc-dias">hace ${dias} día${dias === 1 ? '' : 's'}</span><span class="muted-sm">${esc(fmtDateShort(v.fecha))}</span>${statusBadge(v.estado)}</span>
            </button>
            <div class="venc-acts">
              <button class="btn btn-sm venc-ok" data-venc-set="Completada" data-uid="${esc(v._uid)}">✓ Completada</button>
              <button class="btn btn-sm btn-danger" data-venc-set="Cancelada" data-uid="${esc(v._uid)}">✕ Cancelada</button>
            </div>
          </div>`).join('')}
      </div>`).join('');
  box.querySelectorAll('[data-venc-set]').forEach((b) => (b.onclick = () => cerrarVencidaModal(b.dataset.uid, b.dataset.vencSet)));
  box.querySelectorAll('[data-venc-open]').forEach((el) => (el.onclick = () => {
    const v = store.byUid(el.dataset.vencOpen);
    if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
  }));
}

// Coordinación verifica una visita vencida: Completada (el técnico sí la hizo) o Cancelada (no la hizo)
function cerrarVencidaModal(uid, estado) {
  const v = store.byUid(uid);
  if (!v) return;
  const comp = estado === 'Completada';
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>${comp ? '✓ Marcar como completada' : '✕ Marcar como cancelada'}</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <p><b>${esc(v.cliente || 'Sin nombre')}</b><br><span class="muted-sm">${esc([v.ot, v.tecnico ? parseTecnico(v.tecnico).short : '', fmtDateShort(v.fecha)].filter(Boolean).join(' · '))}</span></p>
      <p class="muted-sm" style="margin:10px 0">${comp
        ? 'Úsalo si confirmaste que el técnico <b>sí hizo</b> el trabajo.' + (v.email && !v.orden_enviada ? ' Se enviará la orden al correo del cliente.' : '')
        : 'Úsalo si el técnico <b>no hizo</b> la visita.'}</p>
      <textarea class="textarea" data-nota rows="2" placeholder="Nota (opcional): ej. confirmado con el cliente por teléfono"></textarea>
    </div>
    <div class="modal-foot"><div class="grow"></div><button class="btn" data-close>Volver</button><button class="btn ${comp ? 'btn-primary' : 'btn-danger'}" data-ok>Confirmar</button></div>`;
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const ok = node.querySelector('[data-ok]');
  ok.onclick = async () => {
    ok.disabled = true;
    try {
      await store.conMedia(v); // historial completo antes de agregar el evento (no se pierde nada)
      const nota = node.querySelector('[data-nota]').value.trim();
      const u = store.currentUser();
      const hist = (Array.isArray(v.historial) ? v.historial : []).concat([{
        ts: Date.now(), autor: (u && u.nombre) || 'Coordinación', tipo: comp ? 'completada' : 'cancelada', estado,
        motivo: 'Visita vencida verificada por coordinación' + (nota ? ': ' + nota : ''),
      }]);
      await store.updateVisita(uid, { estado, historial: JSON.stringify(hist) });
      closeModal();
      toast(comp ? 'Visita marcada como completada ✓' : 'Visita marcada como cancelada');
    } catch (e) {
      ok.disabled = false;
      if (e && e.message !== 'media-no-cargada') toast('No se pudo guardar: ' + (e.message || e), 'error');
    }
  };
  openModal(node, 'sm');
}
