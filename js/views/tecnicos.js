// ============================================================
// WIFIRED · Vista Técnicos (carga y desempeño)
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico } from '../util.js';

export function renderTecnicos(root) {
  const vs = store.visitas();
  const cards = store.tecnicos().map((tec) => {
    const t = parseTecnico(tec);
    const mine = vs.filter((v) => v.tecnico === tec);
    const activas = mine.filter((v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado)).length;
    const comp = mine.filter((v) => v.estado === 'Completada').length;
    return `
    <div class="card tech-card">
      <div class="th">
        <span class="avatar-lg" style="background:${t.color}">${esc(t.initials)}</span>
        <div style="min-width:0">
          <div class="cell-strong truncate">${esc(t.name)}</div>
          <div class="cell-sub">${esc(t.role)}</div>
        </div>
      </div>
      <div class="tstats">
        <div class="tstat"><strong>${mine.length}</strong><span>ASIGNADAS</span></div>
        <div class="tstat"><strong style="color:var(--st-prog-fg)">${activas}</strong><span>ACTIVAS</span></div>
        <div class="tstat"><strong style="color:var(--st-comp-fg)">${comp}</strong><span>COMPLETADAS</span></div>
      </div>
    </div>`;
  }).join('');

  // Sin asignar
  const sin = vs.filter((v) => !v.tecnico);
  const sinCard = `
    <div class="card tech-card" style="border-style:dashed">
      <div class="th">
        <span class="avatar-lg" style="background:var(--surface-2); color:var(--text-3)">?</span>
        <div><div class="cell-strong">Sin asignar</div><div class="cell-sub">Requieren técnico</div></div>
      </div>
      <div class="tstats">
        <div class="tstat"><strong>${sin.length}</strong><span>VISITAS</span></div>
      </div>
    </div>`;

  root.innerHTML = `
    <div class="section-head"><h2>Equipo técnico</h2><span class="muted-sm">${store.tecnicos().length} técnicos · ${vs.length} visitas totales</span></div>
    <div class="grid tech-grid">${cards}${sin.length ? sinCard : ''}</div>`;
}
