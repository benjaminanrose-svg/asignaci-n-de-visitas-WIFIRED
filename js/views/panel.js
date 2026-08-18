// ============================================================
// WIFIRED · Vista Panel (dashboard) con período + estadísticas
// por técnico y por nodo.
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, fmtDateShort, todayISO, parseDate, prioRank } from '../util.js';
import { statusBadge, techAvatar, visitDetailModal, workOrderModal } from '../components.js';
import { visitFormModal } from '../form.js';

const STATUS_COLORS = {
  Pendiente: 'var(--st-pend-dot)', Programada: 'var(--st-prog-dot)',
  Completada: 'var(--st-comp-dot)', Reprogramada: 'var(--st-repr-dot)',
  Cancelada: 'var(--st-canc-dot)',
};

// Estado de la vista (persiste entre re-render reactivos)
const pstate = { periodo: 'todo', perfOpen: true, openTecs: new Set() };
const PERIODOS = [
  ['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Todo'],
];

function weekBounds(today) {
  const d = parseDate(today);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  const monday = new Date(d); monday.setDate(d.getDate() - dow); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}
function inPeriodo(fecha, periodo, today) {
  if (periodo === 'todo') return true;
  if (!fecha) return false;
  if (periodo === 'hoy') return fecha === today;
  const d = parseDate(fecha); if (!d) return false;
  const now = parseDate(today);
  if (periodo === 'anio') return d.getFullYear() === now.getFullYear();
  if (periodo === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (periodo === 'semana') { const { monday, sunday } = weekBounds(today); return d >= monday && d <= sunday; }
  return true;
}
const periodoLabel = () => (PERIODOS.find((p) => p[0] === pstate.periodo) || [, 'Todo'])[1];

export function renderPanel(root) {
  const today = todayISO();
  const all = store.visitas();
  const vs = all.filter((v) => inPeriodo(v.fecha, pstate.periodo, today)); // set del período

  const total = vs.length;
  const by = (st) => vs.filter((v) => v.estado === st).length;
  const pend = by('Pendiente');
  const prog = by('Programada');
  const comp = by('Completada');
  const repr = by('Reprogramada') + by('Cancelada');
  const sinAsignar = vs.filter((v) => !v.tecnico).length;
  const completRate = total ? Math.round((comp / total) * 100) : 0;

  // Donut por estado
  const estados = store.estados();
  const counts = estados.map((e) => ({ e, n: by(e), c: STATUS_COLORS[e] || '#94a3b8' })).filter((x) => x.n > 0);
  let acc = 0;
  const segs = counts.map((x) => {
    const start = (acc / total) * 360;
    acc += x.n;
    const end = (acc / total) * 360;
    return `${x.c} ${start}deg ${end}deg`;
  }).join(', ');

  // Carga por técnico (activas del período)
  const activas = vs.filter((v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado));
  const loadMap = {};
  activas.forEach((v) => { const key = v.tecnico || '__none__'; loadMap[key] = (loadMap[key] || 0) + 1; });
  const loads = Object.entries(loadMap)
    .map(([k, n]) => ({ k, n, name: k === '__none__' ? 'Sin asignar' : parseTecnico(k).short }))
    .sort((a, b) => b.n - a.n).slice(0, 7);
  const maxLoad = Math.max(1, ...loads.map((l) => l.n));

  // Top tipos (período)
  const tipoMap = {};
  vs.forEach((v) => { if (v.tipo) tipoMap[v.tipo] = (tipoMap[v.tipo] || 0) + 1; });
  const topTipos = Object.entries(tipoMap).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  const maxTipo = Math.max(1, ...topTipos.map((t) => t.n));

  // Próximas visitas (siempre a futuro, sobre el total activo)
  const proximas = all.filter((v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado))
    .filter((v) => v.fecha)
    .sort((a, b) => prioRank(a.prioridad) - prioRank(b.prioridad) || (a.fecha < b.fecha ? -1 : 1))
    .slice(0, 6);

  const solicitudes = all.filter((v) => v.reagenda_solicitada);
  const pendVal = all.filter((v) => v.validada === 'pendiente');

  root.innerHTML = `
    ${solicitudes.length ? `<a href="#/visitas" class="req-alert">⏳ <strong>${solicitudes.length}</strong> solicitud(es) de reagenda de técnicos — revisa y asigna nueva fecha →</a>` : ''}
    ${pendVal.length ? `<a href="#/visitas" class="req-alert">🔓 <strong>${pendVal.length}</strong> visita(s) esperando autorización de coordinación (el cliente no entregó el código) →</a>` : ''}

    <div class="period-bar">
      <span class="period-lbl">Período:</span>
      <div class="seg">
        ${PERIODOS.map(([k, l]) => `<button class="seg-btn ${pstate.periodo === k ? 'active' : ''}" data-per="${k}">${esc(l)}</button>`).join('')}
      </div>
      <span class="muted-sm">${total} visita${total === 1 ? '' : 's'} en “${esc(periodoLabel())}”</span>
    </div>

    <div class="grid kpi-grid">
      ${kpi('total', '▦', total, 'Total de visitas', `${sinAsignar} sin asignar`)}
      ${kpi('pend', '◔', pend, 'Pendientes', 'Requieren agenda')}
      ${kpi('prog', '◑', prog, 'Programadas', 'Con técnico asignado')}
      ${kpi('comp', '✓', comp, 'Completadas', `${completRate}% del período`)}
      ${kpi('repr', '↻', repr, 'Reprog. / Canceladas', 'Requieren seguimiento')}
    </div>

    <div class="grid two-col section">
      <div class="card">
        <div class="card-head"><h3>Carga de trabajo por técnico</h3><span class="muted-sm">Visitas activas</span></div>
        <div class="card-pad">
          <div class="barlist">
            ${loads.length ? loads.map((l) => `
              <div class="barrow">
                <span class="bl-label">${esc(l.name)}</span>
                <span class="bl-track"><span class="bl-fill" style="width:${(l.n / maxLoad) * 100}%"></span></span>
                <span class="bl-val">${l.n}</span>
              </div>`).join('') : '<p class="muted" style="padding:12px 0">Sin visitas activas en este período.</p>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Distribución por estado</h3></div>
        <div class="card-pad">
          <div class="donut-wrap">
            <div class="donut" style="background: conic-gradient(${segs || '#e5e7eb 0deg 360deg'})">
              <div class="donut-center"><strong>${total}</strong><span>visitas</span></div>
            </div>
            <div class="legend">
              ${counts.map((x) => `
                <div class="legend-item">
                  <span class="sw" style="background:${x.c}"></span>
                  <span>${esc(x.e)}</span>
                  <span class="lg-val">${x.n}</span>
                </div>`).join('') || '<p class="muted-sm">Sin datos en este período.</p>'}
            </div>
          </div>
        </div>
      </div>
    </div>

    ${rendimientoTecnicos(vs)}
    ${estadisticasNodos(vs)}

    <div class="grid two-col section">
      <div class="card">
        <div class="card-head">
          <h3>Próximas visitas</h3>
          <a class="btn btn-sm btn-ghost" href="#/agenda">Ver agenda →</a>
        </div>
        <div class="card-pad" style="padding-top:6px">
          ${proximas.length ? proximas.map((v) => proxRow(v)).join('') : '<p class="muted" style="padding:16px 0">No hay visitas activas programadas.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Tipos de visita más frecuentes</h3><span class="muted-sm">${esc(periodoLabel())}</span></div>
        <div class="card-pad">
          <div class="barlist">
            ${topTipos.length ? topTipos.map((t) => `
              <div class="barrow">
                <span class="bl-label" title="${esc(t.k)}">${esc(t.k)}</span>
                <span class="bl-track"><span class="bl-fill" style="width:${(t.n / maxTipo) * 100}%"></span></span>
                <span class="bl-val">${t.n}</span>
              </div>`).join('') : '<p class="muted" style="padding:12px 0">Sin datos en este período.</p>'}
          </div>
        </div>
      </div>
    </div>`;

  // selector de período
  root.querySelectorAll('[data-per]').forEach((b) => (b.onclick = () => { pstate.periodo = b.dataset.per; renderPanel(root); }));
  // recordar plegado/expandido del rendimiento por técnico (persiste al refrescar datos)
  const perfCard = root.querySelector('[data-perfcard]');
  if (perfCard) perfCard.addEventListener('toggle', () => { pstate.perfOpen = perfCard.open; });
  root.querySelectorAll('details[data-tec]').forEach((d) => d.addEventListener('toggle', () => {
    const k = d.getAttribute('data-tec');
    if (d.open) pstate.openTecs.add(k); else pstate.openTecs.delete(k);
  }));
  // filas de próximas visitas
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => {
      const v = store.byUid(el.dataset.open);
      if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
    };
  });
}

// ---------- Rendimiento por técnico (colapsable, con avance por técnico) ----------
function rendimientoTecnicos(vs) {
  const map = {};
  vs.forEach((v) => {
    if (!v.tecnico) return;
    const g = map[v.tecnico] || (map[v.tecnico] = { total: 0, comp: 0, tipos: {} });
    g.total++;
    if (v.estado === 'Completada') g.comp++;
    if (v.tipo) g.tipos[v.tipo] = (g.tipos[v.tipo] || 0) + 1;
  });
  const rows = Object.entries(map)
    .map(([k, g]) => ({ k, ...g, name: parseTecnico(k).short, rate: g.total ? Math.round((g.comp / g.total) * 100) : 0 }))
    .sort((a, b) => b.comp - a.comp || b.total - a.total);

  const totComp = rows.reduce((s, r) => s + r.comp, 0);

  const items = rows.length ? rows.map((r) => {
    const tipos = Object.entries(r.tipos).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...tipos.map(([, n]) => n));
    const isOpen = pstate.openTecs.has(r.k);
    return `<details class="perf-item" data-tec="${esc(r.k)}"${isOpen ? ' open' : ''}>
      <summary class="perf-sum">
        <span class="perf-ava">${techAvatar(r.k)}</span>
        <span class="perf-id">
          <span class="cell-strong truncate">${esc(r.name)}</span>
          <span class="cell-sub">${r.comp} de ${r.total} completada${r.total === 1 ? '' : 's'}</span>
        </span>
        <span class="perf-meter" title="${r.rate}% completadas">
          <span class="perf-meter-track"><span class="perf-meter-fill" style="width:${r.rate}%"></span></span>
          <span class="perf-rate">${r.rate}%</span>
        </span>
        <span class="perf-chev" aria-hidden="true">⌄</span>
      </summary>
      <div class="perf-body">
        ${tipos.length ? `<div class="perf-breakdown">${tipos.map(([t, n]) => `
          <div class="mini-bar">
            <span class="mb-label" title="${esc(t)}">${esc(t)}</span>
            <span class="mb-track"><span class="mb-fill" style="width:${(n / maxT) * 100}%"></span></span>
            <span class="mb-val">${n}</span>
          </div>`).join('')}</div>` : '<p class="muted-sm" style="padding:4px 2px">Sin tipos registrados en este período.</p>'}
      </div>
    </details>`;
  }).join('') : '<p class="muted" style="padding:12px 0">Sin visitas asignadas en este período.</p>';

  return `
    <details class="section card perf-card" data-perfcard${pstate.perfOpen !== false ? ' open' : ''}>
      <summary class="card-head perf-head">
        <h3>Rendimiento por técnico</h3>
        <span class="perf-head-meta">
          <span class="muted-sm">${esc(periodoLabel())} · ${rows.length} técnico${rows.length === 1 ? '' : 's'} · ${totComp} completada${totComp === 1 ? '' : 's'}</span>
          <span class="perf-chev" aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div class="card-pad perf-list">
        ${items}
      </div>
    </details>`;
}

// ---------- Estadísticas por nodo ----------
function estadisticasNodos(vs) {
  const nodosCfg = store.nodos();
  const map = {};
  vs.forEach((v) => { if (v.nodo) { const g = map[v.nodo] || (map[v.nodo] = { total: 0, comp: 0 }); g.total++; if (v.estado === 'Completada') g.comp++; } });
  const rows = Object.entries(map).map(([k, g]) => ({ k, ...g })).sort((a, b) => b.total - a.total);
  const maxN = Math.max(1, ...rows.map((r) => r.total));
  const hint = !nodosCfg.length
    ? 'Aún no has creado nodos. Créalos en ⚙ Configuración y asígnalos a las visitas para ver estadísticas por nodo.'
    : 'Ningún nodo tiene visitas en este período. Asigna el nodo al agendar o editar una visita.';
  return `
    <div class="section card">
      <div class="card-head"><h3>Visitas por nodo</h3><span class="muted-sm">${esc(periodoLabel())}</span></div>
      <div class="card-pad">
        <div class="barlist">
          ${rows.length ? rows.map((r) => `
            <div class="barrow">
              <span class="bl-label" title="${esc(r.k)}">📡 ${esc(r.k)}</span>
              <span class="bl-track"><span class="bl-fill" style="width:${(r.total / maxN) * 100}%"></span></span>
              <span class="bl-val">${r.total}<span class="muted-sm" style="margin-left:6px">(${r.comp}✓)</span></span>
            </div>`).join('') : `<p class="muted" style="padding:12px 0">${esc(hint)}</p>`}
        </div>
      </div>
    </div>`;
}

function kpi(kind, ico, val, label, sub) {
  return `
  <div class="card kpi i-${kind}">
    <div class="kpi-top">
      <div>
        <div class="kpi-val">${val}</div>
        <div class="kpi-label">${esc(label)}</div>
      </div>
      <div class="kpi-ico">${ico}</div>
    </div>
    <div class="kpi-sub">${esc(sub)}</div>
  </div>`;
}

function proxRow(v) {
  const t = parseTecnico(v.tecnico);
  return `
  <div class="row-between" data-open="${esc(v._uid)}" style="padding:11px 4px; border-bottom:1px solid var(--border-2); cursor:pointer">
    <div class="row" style="gap:12px; min-width:0">
      ${v.tecnico ? techAvatar(v.tecnico) : '<span class="avatar-sm" style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-3)">?</span>'}
      <div style="min-width:0">
        <div class="cell-strong truncate" style="max-width:230px">${esc(v.cliente || 'Sin nombre')}</div>
        <div class="cell-sub truncate" style="max-width:230px">${esc(v.tipo || '—')}</div>
      </div>
    </div>
    <div class="text-right" style="flex-shrink:0">
      <div style="font-size:12.5px; font-weight:700">${esc(fmtDateShort(v.fecha))}</div>
      <div style="margin-top:4px">${statusBadge(v.estado)}</div>
    </div>
  </div>`;
}
