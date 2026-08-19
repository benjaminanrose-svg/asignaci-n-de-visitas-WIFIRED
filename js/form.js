// ============================================================
// WIFIRED · Formulario de visita (crear / editar / asignar)
// ============================================================
import { esc, todayISO, toast, bindField, validaRut, formatRut, validaFono, formatFono, validaEmail } from './util.js';
import { openModal, closeModal } from './components.js';
import * as store from './store.js';

function opt(list, sel, placeholder) {
  const ph = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
  return ph + list.map((x) => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
}

export function visitFormModal(existing = null, prefill = {}) {
  const v = existing || {};
  const isNew = !existing;
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head">
      <h3>${isNew ? 'Nueva visita' : 'Editar visita · ' + esc(v.id)}</h3>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      <form id="visit-form">
        <div class="form-grid">
          <div class="field full">
            <label>Nombre del cliente *</label>
            <input class="input" name="cliente" required value="${esc(v.cliente || '')}" placeholder="Nombre y apellidos" />
          </div>
          <div class="field">
            <label>RUT</label>
            <input class="input" name="rut" value="${esc(v.rut || '')}" placeholder="12.345.678-9" inputmode="text" autocomplete="off" />
          </div>
          <div class="field">
            <label>Teléfono</label>
            <input class="input" name="telefono" value="${esc(v.telefono || '')}" placeholder="9 1234 5678" inputmode="tel" autocomplete="off" />
          </div>
          <div class="field">
            <label>Correo del cliente</label>
            <input class="input" type="email" name="email" value="${esc(v.email || '')}" placeholder="cliente@correo.com" autocomplete="off" />
          </div>
          <div class="field full">
            <label>Dirección</label>
            <input class="input" name="direccion" value="${esc(v.direccion || '')}" placeholder="Sector, parcela, referencia…" />
          </div>
          <div class="field full">
            <label>Tipo de visita *</label>
            <select class="select" name="tipo" required>${opt(store.tipos(), v.tipo, 'Seleccionar tipo…')}</select>
          </div>
          <div class="field">
            <label>Fecha</label>
            <input class="input" type="date" name="fecha" value="${esc(v.fecha || prefill.fecha || todayISO())}" />
          </div>
          <div class="field">
            <label>Bloque horario</label>
            <select class="select" name="bloque">${opt(store.bloques(), v.bloque || prefill.bloque, 'Sin bloque')}</select>
          </div>
          <div class="field">
            <label>Técnico asignado</label>
            <select class="select" name="tecnico">${opt(store.tecnicos(), v.tecnico || prefill.tecnico, 'Sin asignar')}</select>
          </div>
          <div class="field">
            <label>Estado</label>
            <select class="select" name="estado">${opt(store.estados(), v.estado || 'Pendiente')}</select>
          </div>
          <div class="field">
            <label>Prioridad</label>
            <select class="select" name="prioridad">${opt(store.prioridades(), v.prioridad || 'Media')}</select>
          </div>
          <div class="field">
            <label>Nodo</label>
            <select class="select" name="nodo">${opt(store.nodos(), v.nodo, 'Sin nodo')}</select>
          </div>
          <div class="field full">
            <label>Detalle / problema</label>
            <textarea class="textarea" name="detalle" placeholder="Descripción del trabajo o falla reportada…">${esc(v.detalle || '')}</textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn btn-danger" data-del>Eliminar</button>'}
      <button class="btn" data-close>Cancelar</button>
      <button class="btn btn-primary" data-save>${isNew ? 'Crear visita' : 'Guardar cambios'}</button>
    </div>`;

  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));

  // Validación en vivo (RUT chileno, teléfono y correo). Los campos son opcionales:
  // solo se valida cuando el usuario escribe algo.
  bindField(node.querySelector('[name=rut]'), { validate: validaRut, format: formatRut, msg: '⚠ RUT inválido o inexistente (revisa el dígito verificador)', okMsg: '✓ RUT válido' });
  bindField(node.querySelector('[name=telefono]'), { validate: validaFono, format: formatFono, msg: '⚠ Teléfono inválido (debe tener 9 dígitos)', okMsg: '✓ Teléfono válido' });
  bindField(node.querySelector('[name=email]'), { validate: validaEmail, msg: '⚠ Correo inválido', okMsg: '✓ Correo válido' });

  node.querySelector('[data-save]').onclick = async () => {
    const form = node.querySelector('#visit-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    try {
      if (isNew) {
        if (!data.estado) data.estado = data.tecnico ? 'Programada' : 'Pendiente';
        await store.addVisita(data);
        toast('Visita creada correctamente');
      } else {
        await store.updateVisita(v._uid, data);
        toast('Cambios guardados');
      }
      closeModal();
    } catch (e) { /* el store ya mostró el error */ }
  };

  const del = node.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    if (confirm('¿Eliminar esta visita? Esta acción no se puede deshacer.')) {
      await store.deleteVisita(v._uid);
      toast('Visita eliminada', 'info');
      closeModal();
    }
  };

  openModal(node, 'md', { dismissable: false });
}
