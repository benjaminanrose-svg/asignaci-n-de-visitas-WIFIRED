// ============================================================
// WIFIRED · Ubicación de técnicos en vivo (GPS)
// Mapa con la posición actual de cada técnico. Se actualiza solo
// cada 1 min (la app del técnico reporta su GPS a ese ritmo).
// Sólo coordinación.
// ============================================================
import * as store from '../store.js';
import { esc, toast } from '../util.js';

// Carga Leaflet (mapa) desde CDN una sola vez.
let leafletP;
function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error('No se pudo cargar el mapa (¿sin internet?)'));
    document.head.appendChild(js);
  });
  return leafletP;
}

function hace(ts) {
  if (!ts) return 'sin datos';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
// Fresco = reportó hace menos de 3 min.
const fresco = (ts) => ts && (Date.now() - ts) < 3 * 60 * 1000;

let timer = null;
const markers = new Map(); // id -> L.marker

export async function renderUbicaciones(root) {
  if (!store.isCoordinador()) { root.innerHTML = '<div class="empty-state"><p>Sólo la coordinación puede ver esto.</p></div>'; return; }
  if (timer) { clearInterval(timer); timer = null; }
  markers.clear();

  root.innerHTML = `
    <div class="hist-intro muted-sm">📍 Ubicación <b>en vivo</b> de los técnicos. Se actualiza sola cada 1 minuto (mientras el técnico tenga la app abierta y con permiso de ubicación).</div>
    <div id="mapa-tec" style="height:min(60vh,520px);width:100%;border-radius:12px;overflow:hidden;border:1px solid var(--border);background:var(--panel-2,#0d1117)"></div>
    <div id="lista-tec" style="margin-top:14px"></div>`;

  const mapEl = root.querySelector('#mapa-tec');
  const listEl = root.querySelector('#lista-tec');

  let L, map;
  try {
    L = await ensureLeaflet();
  } catch (e) {
    mapEl.innerHTML = `<div class="empty-state" style="padding:24px"><p>${esc(e.message)}</p></div>`;
  }
  if (L) {
    map = L.map(mapEl).setView([-33.688, -71.216], 11); // Melipilla/Culiprán por defecto
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map);
  }

  const pintar = (list) => {
    // Lista
    if (!list.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="es-ico">📍</div><p>Ningún técnico ha reportado ubicación todavía.<br><span class="muted-sm">Necesitan abrir la app y dar permiso de ubicación.</span></p></div>';
    } else {
      listEl.innerHTML = `<div class="cli-grid">${list.map((t) => {
        const ok = fresco(t.ts);
        const dot = ok ? '#10b981' : '#9ca3af';
        return `<div class="card cli-card" style="cursor:pointer" data-goto="${t.id}">
          <div class="row" style="gap:10px;align-items:center">
            <span style="width:11px;height:11px;border-radius:50%;background:${dot};flex:0 0 auto"></span>
            <div style="flex:1;min-width:0">
              <div class="cell-strong truncate">${esc(t.nombre)}</div>
              <div class="cell-sub">${ok ? '🟢 En línea' : '⚪ '}${hace(t.ts)}</div>
            </div>
            <a class="btn btn-sm" href="https://www.google.com/maps?q=${t.lat},${t.lng}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ver</a>
          </div>
        </div>`;
      }).join('')}</div>`;
    }

    // Marcadores
    if (!map) return;
    const vistos = new Set();
    list.forEach((t) => {
      vistos.add(t.id);
      const label = `${t.nombre} · ${hace(t.ts)}`;
      let mk = markers.get(t.id);
      if (mk) { mk.setLatLng([t.lat, t.lng]); mk.getPopup().setContent(label); }
      else { mk = L.marker([t.lat, t.lng]).addTo(map).bindPopup(label); markers.set(t.id, mk); }
    });
    // Quita marcadores de técnicos que ya no están
    for (const [id, mk] of markers) if (!vistos.has(id)) { map.removeLayer(mk); markers.delete(id); }

    // Centra el mapa la primera vez que hay datos
    if (list.length && !map._centrado) {
      map._centrado = true;
      const b = L.latLngBounds(list.map((t) => [t.lat, t.lng]));
      map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
    }
    // Enlaza clic de tarjeta → centra en el técnico
    listEl.querySelectorAll('[data-goto]').forEach((c) => c.onclick = () => {
      const t = list.find((x) => String(x.id) === c.dataset.goto);
      if (t && map) { map.setView([t.lat, t.lng], 16); markers.get(t.id) && markers.get(t.id).openPopup(); }
    });
  };

  const tick = async () => {
    if (!document.body.contains(mapEl)) { clearInterval(timer); timer = null; return; }
    try { const r = await store.ubicacionesTecnicos(); pintar(r.tecnicos || []); }
    catch (e) { /* reintenta al próximo ciclo */ }
  };

  await tick();
  timer = setInterval(tick, 60 * 1000);
}
