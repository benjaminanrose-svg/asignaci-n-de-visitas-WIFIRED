// ============================================================
// WIFIRED · Formulario de visita (crear / editar / asignar)
// ============================================================
import { esc, todayISO, toast, bindField, validaRut, formatRut, validaFono, formatFono, validaEmail, zonaDeVisita, zonaDeNodo, normName, clientKey } from './util.js';
import { openModal, closeModal } from './components.js';
import * as store from './store.js';

function opt(list, sel, placeholder) {
  const ph = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
  return ph + list.map((x) => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
}

// Índice de clientes (visitas + servicios) para autocompletar en "Nueva visita".
const svcCacheForm = { list: [] };
function buildClientesIndex(servicios) {
  const map = new Map();
  const add = (src, servicio) => {
    const nombre = src.cliente || src.nombre || '';
    const key = clientKey({ rut: src.rut, telefono: src.telefono, nombre });
    if (!key) return;
    const cur = map.get(key) || { key, nombre: '', rut: '', telefono: '', email: '', direccion: '', servicio: null };
    cur.nombre = cur.nombre || nombre;
    cur.rut = cur.rut || src.rut || '';
    cur.telefono = cur.telefono || src.telefono || '';
    cur.email = cur.email || src.email || '';
    cur.direccion = cur.direccion || src.direccion || '';
    if (servicio) cur.servicio = servicio;
    map.set(key, cur);
  };
  (store.visitas ? store.visitas() : []).forEach((x) => add(x, null));
  (servicios || []).forEach((s) => add(s, s));
  return [...map.values()];
}

// Autocompletado + badge de estado en el campo "Nombre del cliente".
// Devuelve { getMatched } con el cliente existente que coincide (o null).
function setupClienteAutocomplete(node) {
  const inp = node.querySelector('[name=cliente]');
  const acEl = node.querySelector('[data-ac]');
  const statusEl = node.querySelector('[data-cli-status]');
  const field = (n) => node.querySelector(`[name=${n}]`);
  let index = [];
  let matched = null;

  const setStatus = () => {
    const nombre = (inp.value || '').trim();
    if (!nombre) { statusEl.innerHTML = ''; matched = null; return; }
    const keyRut = clientKey({ rut: field('rut') ? field('rut').value : '' });
    const m = (keyRut ? index.find((c) => clientKey({ rut: c.rut }) === keyRut) : null)
      || index.find((c) => normName(c.nombre) === normName(nombre)) || null;
    matched = m;
    statusEl.innerHTML = m
      ? '<span class="cli-badge ok">🟢 Cliente registrado</span>'
      : '<span class="cli-badge new">🔵 Nuevo cliente</span>';
  };

  const pintarAC = () => {
    const term = (inp.value || '').toLowerCase().trim();
    const arr = term ? index.filter((c) => `${c.nombre} ${c.rut} ${c.direccion} ${c.telefono}`.toLowerCase().includes(term)).slice(0, 8) : [];
    if (!arr.length) { acEl.hidden = true; acEl.innerHTML = ''; return; }
    acEl.hidden = false;
    acEl.innerHTML = arr.map((c) => `<button type="button" class="cli-ac-opt" data-k="${esc(c.key)}"><span class="cell-strong">${esc(c.nombre)}</span><span class="cell-sub">${[c.rut ? formatRut(c.rut) : '', c.direccion].filter(Boolean).map(esc).join(' · ') || '—'}</span></button>`).join('');
    acEl.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => elegir(index.find((c) => c.key === b.dataset.k))));
  };

  const elegir = (c) => {
    if (!c) return;
    inp.value = c.nombre;
    if (field('rut')) field('rut').value = c.rut ? formatRut(c.rut) : '';
    if (field('telefono')) field('telefono').value = c.telefono || '';
    if (field('email')) field('email').value = c.email || '';
    if (field('direccion')) field('direccion').value = c.direccion || '';
    matched = c;
    acEl.hidden = true; acEl.innerHTML = '';
    setStatus();
  };

  inp.addEventListener('input', () => { setStatus(); pintarAC(); });
  inp.addEventListener('focus', pintarAC);
  inp.addEventListener('blur', () => setTimeout(() => { acEl.hidden = true; }, 150));
  if (field('rut')) field('rut').addEventListener('input', setStatus);

  index = buildClientesIndex(svcCacheForm.list);
  setStatus();
  store.listServicios().then((r) => { svcCacheForm.list = (r && r.servicios) || []; index = buildClientesIndex(svcCacheForm.list); setStatus(); }).catch(() => {});

  return { getMatched: () => matched };
}

// Sincroniza el cliente al crear la visita. La propia visita ya crea/actualiza
// la ficha en la vista Clientes; si además el cliente tiene servicio de internet
// y se editaron sus datos, se actualiza ese registro central.
async function syncCliente(data, matched) {
  const svc = matched && matched.servicio;
  if (!svc || typeof store.updateServicio !== 'function') return;
  const patch = {};
  ['rut', 'telefono', 'email', 'direccion'].forEach((k) => {
    const nuevo = (data[k] || '').trim();
    if (nuevo && nuevo !== (svc[k] || '')) patch[k] = nuevo;
  });
  if (Object.keys(patch).length) { try { await store.updateServicio(svc._uid, patch); } catch (e) { /* no bloquea la creación */ } }
}

export function visitFormModal(existing = null, prefill = {}) {
  const v = existing || {};
  const isNew = !existing;
  const node = document.createElement('div');
  // Garantizamos que "Factibilidad" esté siempre disponible como tipo de visita.
  const tipos = store.tipos().slice();
  if (!tipos.some((t) => String(t).trim().toLowerCase() === 'factibilidad')) tipos.push('Factibilidad');
  node.innerHTML = `
    <div class="modal-head">
      <h3>${isNew ? 'Nueva visita' : 'Editar visita · ' + esc(v.id)}</h3>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      <form id="visit-form">
        <div class="form-grid">
          ${isNew ? '' : `
          <div class="field full" data-facti-hide>
            <label>N° de Orden de Trabajo (OT)</label>
            <input class="input" name="ot" value="${esc(v.id || '')}" placeholder="OT-MEL-2026-001" autocomplete="off" />
          </div>`}
          <div class="field full" style="position:relative">
            <label>Nombre del cliente *</label>
            <input class="input" name="cliente" required value="${esc(v.cliente || prefill.cliente || '')}" placeholder="Nombre y apellidos" autocomplete="off" />
            <div class="cli-ac" data-ac hidden></div>
            <div class="cli-status" data-cli-status></div>
          </div>
          <div class="field" data-facti-hide>
            <label>RUT</label>
            <input class="input" name="rut" value="${esc(v.rut || prefill.rut || '')}" placeholder="12.345.678-9" inputmode="text" autocomplete="off" />
          </div>
          <div class="field" data-facti-hide>
            <label>Teléfono</label>
            <input class="input" name="telefono" value="${esc(v.telefono || prefill.telefono || '')}" placeholder="9 1234 5678" inputmode="tel" autocomplete="off" />
          </div>
          <div class="field" data-facti-hide>
            <label>Correo del cliente</label>
            <input class="input" type="email" name="email" value="${esc(v.email || prefill.email || '')}" placeholder="cliente@correo.com" autocomplete="off" />
          </div>
          <div class="field full">
            <label>Dirección</label>
            <input class="input" name="direccion" value="${esc(v.direccion || prefill.direccion || '')}" placeholder="Sector, parcela, referencia…" />
          </div>
          <div class="field full">
            <label>Tipo de visita *</label>
            <select class="select" name="tipo" required>${opt(tipos, v.tipo, 'Seleccionar tipo…')}</select>
          </div>
          <div class="field" data-facti-hide>
            <label>Fecha</label>
            <input class="input" type="date" name="fecha" value="${esc(v.fecha || prefill.fecha || todayISO())}" />
          </div>
          <div class="field" data-facti-hide>
            <label>Bloque horario</label>
            <select class="select" name="bloque">${opt(store.bloques(), v.bloque || prefill.bloque, 'Sin bloque')}</select>
          </div>
          <div class="field">
            <label>Técnico asignado</label>
            <select class="select" name="tecnico">${opt(store.tecnicos(), v.tecnico || prefill.tecnico, 'Sin asignar')}</select>
          </div>
          <div class="field" data-facti-hide>
            <label>Estado</label>
            <select class="select" name="estado">${opt(store.estados(), v.estado || 'Pendiente')}</select>
          </div>
          <div class="field" data-facti-hide>
            <label>Prioridad</label>
            <select class="select" name="prioridad">${opt(store.prioridades(), v.prioridad || 'Media')}</select>
          </div>
          <div class="field">
            <label>Nodo</label>
            <select class="select" name="nodo">${opt(store.nodos(), v.nodo, 'Sin nodo')}</select>
          </div>
          <div class="field full">
            <label>Detalle / nota</label>
            <textarea class="textarea" name="detalle" placeholder="Descripción del trabajo, falla reportada o nota…">${esc(v.detalle || prefill.detalle || '')}</textarea>
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

  // Tipo "Factibilidad": encoge el formulario y deja solo Nombre, Dirección, Asignación y Nodo.
  const tipoSel = node.querySelector('[name=tipo]');
  const aplicarModoFacti = () => {
    const esFacti = String(tipoSel.value || '').trim().toLowerCase() === 'factibilidad';
    node.querySelectorAll('[data-facti-hide]').forEach((el) => { el.style.display = esFacti ? 'none' : ''; });
  };
  tipoSel.addEventListener('change', aplicarModoFacti);
  aplicarModoFacti(); // aplicar al abrir (por si se edita una visita de Factibilidad)

  // Al elegir técnico, autoseleccionar el nodo de su zona (Jeremy→Melipilla,
  // Moisés→Paine) si existe entre los nodos. Se puede cambiar a mano después.
  const tecSel = node.querySelector('[name=tecnico]');
  const nodoSel = node.querySelector('[name=nodo]');
  if (tecSel && nodoSel) tecSel.addEventListener('change', () => {
    const z = zonaDeVisita({ tecnico: tecSel.value });
    if (!z) return;
    // Elige un nodo cuya zona configurada coincida con la del técnico.
    const opt = [...nodoSel.options].find((o) => o.value && (zonaDeNodo(o.value) || {}).key === z.key);
    if (opt) nodoSel.value = opt.value;
  });

  // Validación en vivo (RUT chileno, teléfono y correo). Los campos son opcionales:
  // solo se valida cuando el usuario escribe algo.
  bindField(node.querySelector('[name=rut]'), { validate: validaRut, format: formatRut, msg: '⚠ RUT inválido o inexistente (revisa el dígito verificador)', okMsg: '✓ RUT válido' });
  bindField(node.querySelector('[name=telefono]'), { validate: validaFono, format: formatFono, msg: '⚠ Teléfono inválido (debe tener 9 dígitos)', okMsg: '✓ Teléfono válido' });
  bindField(node.querySelector('[name=email]'), { validate: validaEmail, msg: '⚠ Correo inválido', okMsg: '✓ Correo válido' });

  // Autocompletado de clientes (solo en el campo de nombre; útil sobre todo al crear).
  const clienteAC = setupClienteAutocomplete(node);

  node.querySelector('[data-save]').onclick = async () => {
    const form = node.querySelector('#visit-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    try {
      if (isNew) {
        if (!data.estado) data.estado = data.tecnico ? 'Programada' : 'Pendiente';
        await store.addVisita(data);
        // Cliente existente con cambios → actualiza su ficha; nuevo → la visita ya lo crea.
        await syncCliente(data, clienteAC.getMatched());
        toast('Visita creada correctamente');
      } else {
        await store.updateVisita(v._uid, data);
        await syncCliente(data, clienteAC.getMatched());
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
