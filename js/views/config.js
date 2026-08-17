// ============================================================
// WIFIRED · Vista Configuración (sólo coordinación)
// Edita las listas del formulario de visitas (tipos, bloques,
// estados, prioridades), los datos de la empresa para la orden
// de trabajo y el correo que recibe copia de la evidencia.
// ============================================================
import * as store from '../store.js';
import { esc, toast, bindField, validaEmail } from '../util.js';

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

export function renderConfig(root) {
  if (!store.isCoordinador()) { root.innerHTML = '<div class="empty-state"><div class="es-ico">🔒</div><p>Sólo coordinación puede editar la configuración.</p></div>'; return; }

  const cfg = store.configFull() || {};
  const emp = cfg.empresa || {};
  const fonos = Array.isArray(emp.fonos) ? emp.fonos.join(', ') : (emp.fonos || '');

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
        <h3 class="cfg-title">📧 Correo para recibir la evidencia</h3>
        <p class="muted-sm">Cuando un técnico completa, cancela o pide reagenda, se enviará una copia de la nota y las fotos a este correo para que quede archivada. Luego la evidencia se limpia como siempre.</p>
        <div class="field" style="margin-top:10px">
          <label>Correo de archivo de evidencia</label>
          <input class="input" type="email" data-evemail value="${esc(cfg.evidencia_email || '')}" placeholder="archivo@wifired.cl">
        </div>
        <p class="muted-sm" style="margin-top:8px">Requiere tener el correo configurado en el servidor (Brevo/Resend). Si lo dejas vacío, no se envía nada.</p>
      </div>

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
  bindField(root.querySelector('[data-evemail]'), { validate: validaEmail, msg: 'Correo inválido' });
  bindField(root.querySelector('[data-emp="email"]'), { validate: validaEmail, msg: 'Correo inválido' });

  // Guardar
  const doSave = async (btn) => {
    const evEmail = (root.querySelector('[data-evemail]').value || '').trim();
    const empEmail = (root.querySelector('[data-emp="email"]').value || '').trim();
    if (evEmail && !validaEmail(evEmail)) { toast('El correo de archivo de evidencia no es válido', 'info'); return; }
    if (empEmail && !validaEmail(empEmail)) { toast('El correo de contacto de la empresa no es válido', 'info'); return; }
    const empFonos = (root.querySelector('[data-emp="fonos"]').value || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const payload = {
      evidencia_email: (root.querySelector('[data-evemail]').value || '').trim(),
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
