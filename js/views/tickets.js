// ============================================================
// WIFIRED · Vista Tickets — centro de atención al cliente
// Los tickets llegan por WhatsApp (bot) o se crean a mano. Se
// clasifican por categoría y estado. Los de "Contratación" pasan
// por el flujo de factibilidad (ubicación → aprobar → enviar planes).
// ============================================================
import * as store from '../store.js';
import { esc, waLink, telLink, normalizaFono, toast } from '../util.js';
import { openModal, closeModal } from '../components.js';
import { visitFormModal } from '../form.js';

const local = { q: '', cat: '', estado: '' };

// Categorías con su ícono y color
const CATS = {
  'Soporte':      { emo: '🛠️', color: '#f59e0b' },
  'Contratación': { emo: '📶', color: '#2563eb' },
  'Pagos':        { emo: '💳', color: '#10b981' },
  'Visita':       { emo: '📅', color: '#8b5cf6' },
  'Ejecutivo':    { emo: '🧑‍💼', color: '#06b6d4' },
  'Otros':        { emo: '💬', color: '#94a3b8' },
};
const CAT_LIST = Object.keys(CATS);

const ESTADOS = {
  'Nuevo':      '#2563eb',
  'En proceso': '#f59e0b',
  'Resuelto':   '#10b981',
  'Cerrado':    '#94a3b8',
};
const ESTADO_LIST = Object.keys(ESTADOS);

// Estados del flujo de factibilidad (sólo categoría Contratación)
const FACTS = [
  { v: 'pendiente',       l: 'En revisión',    color: '#f59e0b' },
  { v: 'factible',        l: '✅ Factible',     color: '#10b981' },
  { v: 'no_factible',     l: '❌ No factible',  color: '#ef4444' },
  { v: 'planes_enviados', l: '📤 Planes enviados', color: '#06b6d4' },
];
function factMeta(v) { return FACTS.find((f) => f.v === v); }

/** ¿Qué tiene que hacer AHORA el coordinador con este ticket? (null si nada pendiente) */
function accionPendiente(t) {
  if (t.estado === 'Cerrado' || t.estado === 'Resuelto') return null;
  if (t.categoria === 'Contratación') {
    const f = t.factibilidad || 'pendiente';
    if (f === 'pendiente') return { l: 'Revisar factibilidad', color: '#f59e0b' };
    if (f === 'factible') return { l: 'Enviar planes', color: '#2563eb' };
    if (f === 'planes_enviados') return { l: 'Cerrar la venta', color: '#06b6d4' };
    return null; // no_factible: nada más que hacer
  }
  if (t.estado === 'Nuevo') return { l: 'Atender', color: '#2563eb' };
  return null;
}

/** Orden: lo que necesita acción va arriba; luego lo más nuevo primero */
function prioridadTicket(t) {
  if (t.estado === 'Cerrado') return 6;
  if (t.estado === 'Resuelto') return 5;
  const a = accionPendiente(t);
  if (a) return t.categoria === 'Contratación' ? 0 : 1;
  if (t.estado === 'En proceso') return 3;
  return 4;
}

/** Guía visual paso a paso para tickets de Contratación */
function guiaContratacionHtml(t) {
  const f = t.factibilidad || 'pendiente';
  const pasos = ['Factibilidad', 'Enviar planes', 'Coordinar instalación'];
  let activo = 0, banner = '';
  if (f === 'pendiente') { activo = 0; banner = '📍 <strong>Ahora:</strong> revisa la ubicación en el mapa y marca <strong>Factible</strong> o <strong>No factible</strong> abajo.'; }
  else if (f === 'factible') { activo = 1; banner = '✅ <strong>Es factible.</strong> Ahora envíale los planes con el botón <strong>“Enviar planes por WhatsApp”</strong>.'; }
  else if (f === 'planes_enviados') { activo = 2; banner = '📤 <strong>Planes enviados.</strong> Cuando el cliente elija su plan, el bot lo registra y avisa. Luego coordina con <strong>“Convertir en visita”</strong>.'; }
  else if (f === 'no_factible') { activo = -1; banner = '❌ <strong>Sin cobertura.</strong> Avísale al cliente y marca el ticket como <strong>Cerrado</strong>.'; }
  const stepper = pasos.map((p, i) => {
    const done = activo > i && activo !== -1;
    const now = activo === i;
    const bg = now ? '#2563eb' : done ? '#10b981' : 'transparent';
    const fg = (now || done) ? '#fff' : 'var(--text-3)';
    const bd = now ? '#2563eb' : done ? '#10b981' : 'var(--border)';
    return `<div style="display:flex;align-items:center;gap:6px">
        <span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:${bg};color:${fg};border:1px solid ${bd}">${done ? '✓' : i + 1}</span>
        <span style="font-size:12px;color:${now ? 'var(--text)' : 'var(--text-3)'};font-weight:${now ? '700' : '400'}">${p}</span>
      </div>`;
  }).join('<span style="flex:1;height:1px;background:var(--border);min-width:10px"></span>');
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:9px">${stepper}</div>
      <div style="font-size:13px;line-height:1.45;color:var(--text)">${banner}</div>
    </div>`;
}

/** Chip de color (tinte suave) */
function chip(text, color) {
  return `<span class="tag" style="background:color-mix(in srgb, ${color} 16%, transparent); border-color:color-mix(in srgb, ${color} 40%, var(--border)); color:${color}">${text}</span>`;
}
function catChip(cat) { const c = CATS[cat] || CATS['Otros']; return chip(`${c.emo} ${esc(cat)}`, c.color); }
function estadoChip(e) { return chip(esc(e), ESTADOS[e] || '#94a3b8'); }

/** Enlace a Google Maps a partir de "lat,lng", una URL o una dirección */
function mapsLink(ubic) {
  const s = (ubic || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return `https://www.google.com/maps?q=${m[1]},${m[2]}`;
  return `https://www.google.com/maps/search/${encodeURIComponent(s)}`;
}

/** Formatea una marca de tiempo ISO (con hora) */
function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function renderTickets(root) {
  root.innerHTML = `
    <div class="hist-intro muted-sm">🎫 Aquí llegan y se clasifican las solicitudes de tus clientes (por WhatsApp o creadas a mano). Toca un ticket para gestionarlo.</div>
    <div id="tk-stats" class="tk-stats"></div>
    <div class="filters">
      <div class="search-box" style="flex:1; min-width:220px; max-width:420px">
        <span class="search-ico">⌕</span>
        <input type="search" class="input" data-q placeholder="Buscar por nombre, teléfono o mensaje…" value="${esc(local.q)}" autocomplete="off">
      </div>
      <select class="select" data-cat>
        <option value="">Todas las categorías</option>
        ${CAT_LIST.map((c) => `<option value="${esc(c)}" ${local.cat === c ? 'selected' : ''}>${CATS[c].emo} ${esc(c)}</option>`).join('')}
      </select>
      <select class="select" data-estado>
        <option value="">Todos los estados</option>
        ${ESTADO_LIST.map((e) => `<option value="${esc(e)}" ${local.estado === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
      </select>
      <div class="grow"></div>
      <button class="btn btn-sm" data-clear>Limpiar</button>
      <button class="btn btn-sm btn-primary" data-nuevo>＋ Nuevo ticket</button>
    </div>
    <div id="tk-host"></div>`;

  const host = root.querySelector('#tk-host');
  const inputQ = root.querySelector('[data-q]');
  inputQ.oninput = () => { local.q = inputQ.value.trim().toLowerCase(); paint(); };
  root.querySelector('[data-cat]').onchange = (e) => { local.cat = e.target.value; paint(); };
  root.querySelector('[data-estado]').onchange = (e) => { local.estado = e.target.value; paint(); };
  root.querySelector('[data-clear]').onclick = () => { local.q = ''; local.cat = ''; local.estado = ''; renderTickets(root); };
  root.querySelector('[data-nuevo]').onclick = () => ticketFormModal();

  function paint() {
    let list = store.ticketsList().slice();
    // Resumen por estado
    const stats = root.querySelector('#tk-stats');
    const nuevos = list.filter((t) => t.estado === 'Nuevo').length;
    const proceso = list.filter((t) => t.estado === 'En proceso').length;
    const porAtender = list.filter((t) => accionPendiente(t)).length;
    stats.innerHTML = list.length
      ? `${porAtender ? chip(`🔔 ${porAtender} por atender`, '#ef4444') + ' ' : ''}${chip(`${nuevos} nuevo${nuevos === 1 ? '' : 's'}`, '#2563eb')} ${chip(`${proceso} en proceso`, '#f59e0b')} <span class="muted-sm">· ${list.length} en total</span>`
      : '';

    if (local.cat) list = list.filter((t) => t.categoria === local.cat);
    if (local.estado) list = list.filter((t) => t.estado === local.estado);
    if (local.q) {
      list = list.filter((t) => [t.nombre, t.telefono, t.mensaje, t.direccion, t.num]
        .some((f) => (f || '').toLowerCase().includes(local.q)));
    }

    // Ordena: lo que requiere acción del coordinador va arriba; dentro, lo más nuevo primero.
    list.sort((a, b) => prioridadTicket(a) - prioridadTicket(b) || (b.created_at || '').localeCompare(a.created_at || ''));

    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><div class="es-ico">🎫</div><p>${
        store.ticketsList().length ? 'No hay tickets con esos filtros.' : 'Aún no hay tickets. Cuando el bot de WhatsApp reciba una solicitud, aparecerá aquí. También puedes crear uno con “Nuevo ticket”.'
      }</p></div>`;
      return;
    }

    host.innerHTML = `<div class="cli-grid">${list.map(cardHtml).join('')}</div>
      <div class="muted-sm" style="padding:14px 4px 0">${list.length} ticket${list.length === 1 ? '' : 's'}</div>`;
    host.querySelectorAll('[data-open]').forEach((el) => (el.onclick = () => openTicket(el.dataset.open)));
  }

  paint();
}

function cardHtml(t) {
  const fm = t.categoria === 'Contratación' && t.factibilidad ? factMeta(t.factibilidad) : null;
  const tel = t.telefono ? `📞 ${esc(t.telefono)}` : '';
  const msg = (t.mensaje || '').trim();
  const acc = accionPendiente(t);
  const accent = acc ? acc.color : (t.estado === 'Nuevo' ? '#2563eb' : '');
  const style = accent ? ` style="border-left:4px solid ${accent}"` : '';
  return `
    <button class="card cli-card" data-open="${esc(t._uid)}"${style}>
      <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
        <span class="tk-num">${esc(t.num)}</span>
        ${catChip(t.categoria)}
        ${estadoChip(t.estado)}
        ${fm ? chip(fm.l, fm.color) : ''}
      </div>
      <div style="text-align:left; margin-top:10px">
        <div class="cell-strong truncate">${esc(t.nombre || 'Sin nombre')}</div>
        ${tel ? `<div class="cell-sub truncate">${tel}</div>` : ''}
        ${msg ? `<div class="cell-sub tk-msg">${esc(msg)}</div>` : ''}
      </div>
      ${acc ? `<div style="text-align:left;margin-top:8px;font-size:13px;font-weight:600;color:${acc.color}">👉 ${acc.l}</div>` : ''}
      <div class="cli-foot muted-sm">${t.canal === 'whatsapp' ? '🟢 WhatsApp' : '✍️ Manual'} · ${esc(fmtTs(t.created_at))}</div>
    </button>`;
}

// ---------- Ficha / gestión del ticket ----------
function openTicket(uid) {
  const t = store.ticketByUid(uid);
  if (!t) return;
  const node = document.createElement('div');
  node.innerHTML = detailHtml(t);
  wire(node, uid);
  openModal(node, 'md');
}

function refreshNode(node, uid) {
  const t = store.ticketByUid(uid);
  if (!t) { closeModal(); return; }
  node.innerHTML = detailHtml(t);
  wire(node, uid);
}

async function applyPatch(node, uid, patch) {
  try { await store.updateTicket(uid, patch); refreshNode(node, uid); } catch (e) { /* store avisó */ }
}

function detailHtml(t) {
  const c = CATS[t.categoria] || CATS['Otros'];
  const fono = normalizaFono(t.telefono);
  const wa = waLink(t.telefono);
  const tel = telLink(t.telefono);
  const maps = mapsLink(t.ubicacion);
  const esContrat = t.categoria === 'Contratación';
  return `
    <div class="modal-head">
      <h3>${c.emo} ${esc(t.num)} · ${esc(t.categoria)}</h3>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-bottom:12px">
        ${estadoChip(t.estado)}
        ${esContrat && t.factibilidad ? chip(factMeta(t.factibilidad).l, factMeta(t.factibilidad).color) : ''}
        <span class="tag">${t.canal === 'whatsapp' ? '🟢 WhatsApp' : '✍️ Manual'}</span>
      </div>

      <div class="tk-detail">
        <div class="tk-row"><span class="tk-lbl">Cliente</span><span class="tk-val">${esc(t.nombre || '—')}</span></div>
        <div class="tk-row"><span class="tk-lbl">Teléfono</span><span class="tk-val">${
          fono ? `${esc(t.telefono)} ${wa ? `<a class="tk-link" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''} ${tel ? `<a class="tk-link" href="${tel}">Llamar</a>` : ''}` : '—'
        }</span></div>
        <div class="tk-row"><span class="tk-lbl">Dirección</span><span class="tk-val">${esc(t.direccion || '—')}</span></div>
        <div class="tk-row"><span class="tk-lbl">Ubicación</span><span class="tk-val">${
          t.ubicacion ? `${esc(t.ubicacion)} ${maps ? `<a class="tk-link" href="${maps}" target="_blank" rel="noopener">📍 Ver en mapa</a>` : ''}` : '—'
        }</span></div>
        <div class="tk-row"><span class="tk-lbl">Recibido</span><span class="tk-val">${esc(fmtTs(t.created_at))}</span></div>
      </div>

      ${t.mensaje ? `<div class="tk-quote">${esc(t.mensaje)}</div>` : ''}

      ${esContrat ? `
        <div class="tk-section">
          <label class="tk-section-lbl">Proceso de contratación</label>
          ${guiaContratacionHtml(t)}
          <div class="row" style="gap:6px; flex-wrap:wrap">
            ${FACTS.map((f) => `<button class="btn btn-sm ${t.factibilidad === f.v ? 'btn-primary' : ''}" data-fact="${f.v}">${f.l}</button>`).join('')}
          </div>
          <div style="margin-top:10px">
            <button class="btn btn-sm btn-primary" data-planes ${t.telefono ? '' : 'disabled title="El ticket no tiene teléfono"'}>📤 Enviar planes por WhatsApp</button>
          </div>
        </div>` : ''}

      <div class="form-grid" style="margin-top:14px">
        <div class="field">
          <label>Categoría</label>
          <select class="select" data-cat>${CAT_LIST.map((k) => `<option value="${esc(k)}" ${t.categoria === k ? 'selected' : ''}>${CATS[k].emo} ${esc(k)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Estado</label>
          <select class="select" data-estado>${ESTADO_LIST.map((e) => `<option value="${esc(e)}" ${t.estado === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
        </div>
        <div class="field full">
          <label>Notas internas</label>
          <textarea class="textarea" data-notas placeholder="Notas de coordinación (no las ve el cliente)…">${esc(t.notas || '')}</textarea>
          <div class="row" style="justify-content:flex-end; margin-top:6px"><button class="btn btn-sm" data-savenotas>Guardar notas</button></div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" data-del>Eliminar</button>
      <div class="grow"></div>
      <button class="btn" data-close>Cerrar</button>
      <button class="btn btn-primary" data-visita>📅 Convertir en visita</button>
    </div>`;
}

function wire(node, uid) {
  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  const cat = node.querySelector('[data-cat]');
  if (cat) cat.onchange = (e) => applyPatch(node, uid, { categoria: e.target.value });
  const est = node.querySelector('[data-estado]');
  if (est) est.onchange = (e) => applyPatch(node, uid, { estado: e.target.value });
  node.querySelectorAll('[data-fact]').forEach((b) => (b.onclick = () => applyPatch(node, uid, { factibilidad: b.dataset.fact })));

  const planes = node.querySelector('[data-planes]');
  if (planes) planes.onclick = async () => {
    if (!confirm('¿Enviar los planes al cliente por WhatsApp?\n(Se usa el texto configurado en el Bot de WhatsApp.)')) return;
    planes.disabled = true;
    try {
      await store.enviarPlanes(uid);
      toast('📤 Planes en cola de envío por WhatsApp');
      refreshNode(node, uid);
    } catch (e) { toast(e.message, 'info'); planes.disabled = false; }
  };

  const saveNotas = node.querySelector('[data-savenotas]');
  if (saveNotas) saveNotas.onclick = async () => {
    const notas = node.querySelector('[data-notas]').value;
    await store.updateTicket(uid, { notas });
    toast('Notas guardadas');
  };

  const btnVisita = node.querySelector('[data-visita]');
  if (btnVisita) btnVisita.onclick = () => {
    const t = store.ticketByUid(uid);
    closeModal();
    visitFormModal(null, {
      cliente: t.nombre || '', telefono: t.telefono || '', direccion: t.direccion || '',
      detalle: `[Ticket ${t.num}] ${t.mensaje || ''}`.trim(),
    });
  };

  const del = node.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    if (confirm('¿Eliminar este ticket? Esta acción no se puede deshacer.')) {
      await store.deleteTicket(uid);
      toast('Ticket eliminado', 'info');
      closeModal();
    }
  };
}

// ---------- Crear ticket manual ----------
function ticketFormModal() {
  const node = document.createElement('div');
  node.innerHTML = `
    <div class="modal-head"><h3>Nuevo ticket</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <form id="tk-form">
        <div class="form-grid">
          <div class="field full">
            <label>Categoría *</label>
            <select class="select" name="categoria" required>${CAT_LIST.map((k) => `<option value="${esc(k)}">${CATS[k].emo} ${esc(k)}</option>`).join('')}</select>
          </div>
          <div class="field full">
            <label>Nombre del cliente</label>
            <input class="input" name="nombre" placeholder="Nombre y apellidos" />
          </div>
          <div class="field">
            <label>Teléfono</label>
            <input class="input" name="telefono" placeholder="9 1234 5678" inputmode="tel" autocomplete="off" />
          </div>
          <div class="field">
            <label>Dirección</label>
            <input class="input" name="direccion" placeholder="Sector, parcela, referencia…" />
          </div>
          <div class="field full">
            <label>Ubicación (coordenadas o enlace de mapa)</label>
            <input class="input" name="ubicacion" placeholder="-33.6889, -71.2153  ·  o pega un enlace de Google Maps" autocomplete="off" />
          </div>
          <div class="field full">
            <label>Mensaje / solicitud</label>
            <textarea class="textarea" name="mensaje" placeholder="Qué necesita el cliente…"></textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancelar</button>
      <button class="btn btn-primary" data-save>Crear ticket</button>
    </div>`;

  node.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  node.querySelector('[data-save]').onclick = async () => {
    const form = node.querySelector('#tk-form');
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    data.canal = 'manual';
    data.estado = 'Nuevo';
    if (data.categoria === 'Contratación') data.factibilidad = 'pendiente';
    try {
      await store.addTicket(data);
      toast('Ticket creado');
      closeModal();
    } catch (e) { /* store avisó */ }
  };

  openModal(node, 'md', { dismissable: false });
}
