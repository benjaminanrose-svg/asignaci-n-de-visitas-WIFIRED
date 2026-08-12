// ============================================================
// WIFIRED · Formulario de técnico (crear / editar)
// ============================================================
import { esc, toast } from './util.js';
import { openModal, closeModal } from './components.js';
import * as store from './store.js';

const ROLES = ['Técnico', 'Ingeniero', 'Soporte de Emergencia', 'Soporte', 'Planta Externa'];

export function techFormModal(existing = null) {
  const t = existing || {};
  const isNew = !existing;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <h3>${isNew ? 'Nuevo técnico' : 'Editar técnico'}</h3>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      <form id="tech-form">
        <div class="form-grid">
          <div class="field">
            <label>Rol / cargo *</label>
            <select class="select" name="rol" required>
              ${ROLES.map((r) => `<option value="${esc(r)}" ${r === (t.rol || 'Técnico') ? 'selected' : ''}>${esc(r)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Teléfono</label>
            <input class="input" name="telefono" value="${esc(t.telefono || '')}" placeholder="9 1234 5678" />
          </div>
          <div class="field full">
            <label>Nombre completo</label>
            <input class="input" name="nombre" value="${esc(t.nombre || '')}" placeholder="Nombre y apellidos" />
            <span class="muted-sm">Para roles como “Soporte de Emergencia” el nombre puede quedar vacío.</span>
          </div>
          <div class="field full">
            <label class="row" style="gap:8px; cursor:pointer">
              <input type="checkbox" name="activo" ${t.activo === false ? '' : 'checked'} style="width:16px;height:16px" />
              Activo (disponible para asignación)
            </label>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn btn-danger" data-del>Eliminar</button>'}
      <button class="btn" data-close>Cancelar</button>
      <button class="btn btn-primary" data-save>${isNew ? 'Crear técnico' : 'Guardar'}</button>
    </div>`;

  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));

  node.querySelector('[data-save]').onclick = async () => {
    const form = node.querySelector('#tech-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      rol: fd.get('rol'),
      nombre: (fd.get('nombre') || '').trim(),
      telefono: (fd.get('telefono') || '').trim(),
      activo: fd.get('activo') === 'on',
    };
    try {
      if (isNew) { await store.addTecnico(data); toast('Técnico creado'); }
      else { await store.updateTecnico(t.id, data); toast('Cambios guardados'); }
      closeModal();
    } catch (e) { /* toast ya mostrado en el store */ }
  };

  const del = node.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    if (confirm(`¿Eliminar a “${t.display || t.nombre}”? Las visitas ya asignadas conservan su nombre.`)) {
      await store.deleteTecnico(t.id);
      toast('Técnico eliminado', 'info');
      closeModal();
    }
  };

  openModal(node, 'md');
}
