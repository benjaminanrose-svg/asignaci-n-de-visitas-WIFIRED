// ============================================================
// WIFIRED · Vista Panel (dashboard)
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, fmtDateShort, todayISO, parseDate } from '../util.js';
import { statusBadge, techAvatar, visitDetailModal, workOrderModal } from '../components.js';
import { visitFormModal } from '../form.js';

const STATUS_COLORS = {
  Pendiente: 'var(--st-pend-dot)', Programada: 'var(--st-prog-dot)',
  Completada: 'var(--st-comp-dot)', Reprogramada: 'var(--st-repr-dot)',
  Cancelada: 'var(--st-canc-dot)',
};

export function renderPanel(root) {
  const vs = store.visitas();
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

  // Carga por técnico (activas = no completadas/canceladas)
  const activas = vs.filter((v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado));
  const loadMap = {};
  activas.forEach((v) => {
    const key = v.tecnico || '__none__';
    loadMap[key] = (loadMap[key] || 0) + 1;
  });
  const loads = Object.entries(loadMap)
    .map(([k, n]) => ({ k, n, name: k === '__none__' ? 'Sin asignar' : parseTecnico(k).short }))
    .sort((a, b) => b.n - a.n).slice(0, 7);
  const maxLoad = Math.max(1, ...loads.map((l) => l.n));

  // Top tipos
  const tipoMap = {};
  vs.forEach((v) => { if (v.tipo) tipoMap[v.tipo] = (tipoMap[v.tipo] || 0) + 1; });
  const topTipos = Object.entries(tipoMap).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  const maxTipo = Math.max(1, ...topTipos.map((t) => t.n));

  // Próximas visitas (activas, ordenadas por fecha >= hoy)
  const today = todayISO();
  const proximas = activas
    .filter((v) => v.fecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .slice(0, 6);

  const solicitudes = vs.filter((v) => v.reagenda_solicitada);

  root.innerHTML = `
    ${solicitudes.length ? `<a href="#/visitas" class="req-alert">⏳ <strong>${solicitudes.length}</strong> solicitud(es) de reagenda de técnicos — revisa y asigna nueva fecha →</a>` : ''}
    <div class="grid kpi-grid">
      ${kpi('total', '▦', total, 'Total de visitas', `${sinAsignar} sin asignar`)}
      ${kpi('pend', '◔', pend, 'Pendientes', 'Requieren agenda')}
      ${kpi('prog', '◑', prog, 'Programadas', 'Con técnico asignado')}
      ${kpi('comp', '✓', comp, 'Completadas', `${completRate}% del total`)}
      ${kpi('repr', '↻', repr, 'Reprog. / Canceladas', 'Requieren seguimiento')}
    </div>

    <div class="grid two-col section">
      <div class="card">
        <div class="card-head"><h3>Carga de trabajo por técnico</h3><span class="muted-sm">Visitas activas</span></div>
        <div class="card-pad">
          <div class="barlist">
            ${loads.map((l) => `
              <div class="barrow">
                <span class="bl-label">${esc(l.name)}</span>
                <span class="bl-track"><span class="bl-fill" style="width:${(l.n / maxLoad) * 100}%"></span></span>
                <span class="bl-val">${l.n}</span>
              </div>`).join('')}
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
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

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
        <div class="card-head"><h3>Tipos de visita más frecuentes</h3></div>
        <div class="card-pad">
          <div class="barlist">
            ${topTipos.map((t) => `
              <div class="barrow">
                <span class="bl-label" title="${esc(t.k)}">${esc(t.k)}</span>
                <span class="bl-track"><span class="bl-fill" style="width:${(t.n / maxTipo) * 100}%"></span></span>
                <span class="bl-val">${t.n}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

  // interacción: filas de próximas visitas
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => {
      const v = store.byUid(el.dataset.open);
      if (v) visitDetailModal(v, { onEdit: (x) => visitFormModal(x), onOrder: (x) => workOrderModal(x, store.company) });
    };
  });
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
