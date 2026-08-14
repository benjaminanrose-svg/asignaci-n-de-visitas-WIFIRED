// ============================================================
// WIFIRED · Vista Técnicos (administración + carga de trabajo)
// ============================================================
import * as store from '../store.js';
import { esc, parseTecnico, toast } from '../util.js';
import { techFormModal } from '../techform.js';

export function renderTecnicos(root) {
  const vs = store.visitas();
  const list = store.tecnicosList();

  const cards = list.map((tec) => {
    const display = tec.display;
    const t = parseTecnico(display);
    const mine = vs.filter((v) => v.tecnico === display);
    const activas = mine.filter((v) => ['Pendiente', 'Programada', 'Reprogramada'].includes(v.estado)).length;
    const comp = mine.filter((v) => v.estado === 'Completada').length;
    const inactivo = tec.activo === false;
    return `
    <div class="card tech-card" data-edit="${tec.id}" style="cursor:pointer; ${inactivo ? 'opacity:.6' : ''}">
      <div class="th">
        <span class="avatar-lg" style="background:${inactivo ? 'var(--text-3)' : t.color}">${esc(t.initials)}</span>
        <div style="min-width:0; flex:1">
          <div class="cell-strong truncate">${esc(tec.nombre || t.role)}</div>
          <div class="cell-sub">${esc(tec.rol)}${tec.telefono ? ' · ' + esc(tec.telefono) : ''}</div>
        </div>
        ${inactivo ? '<span class="tag">Inactivo</span>' : ''}
      </div>
      <div class="tech-creds">
        <div class="tc-row"><span class="tc-k">👤 Usuario</span><span class="tc-v">${esc(tec.username || '—')}</span></div>
        <div class="tc-row"><span class="tc-k">🔑 Clave</span><span class="tc-v">${esc(tec.password || '—')}</span></div>
        <button class="tc-copy" data-copy="Usuario: ${esc(tec.username || '')}  Clave: ${esc(tec.password || '')}" title="Copiar acceso">⧉ Copiar</button>
      </div>
      <div class="tstats">
        <div class="tstat"><strong>${mine.length}</strong><span>ASIGNADAS</span></div>
        <div class="tstat"><strong style="color:var(--st-prog-fg)">${activas}</strong><span>ACTIVAS</span></div>
        <div class="tstat"><strong style="color:var(--st-comp-fg)">${comp}</strong><span>COMPLETADAS</span></div>
      </div>
    </div>`;
  }).join('');

  const sin = vs.filter((v) => !v.tecnico);
  const sinCard = sin.length ? `
    <div class="card tech-card" style="border-style:dashed">
      <div class="th">
        <span class="avatar-lg" style="background:var(--surface-2); color:var(--text-3)">?</span>
        <div><div class="cell-strong">Sin asignar</div><div class="cell-sub">Requieren técnico</div></div>
      </div>
      <div class="tstats"><div class="tstat"><strong>${sin.length}</strong><span>VISITAS</span></div></div>
    </div>` : '';

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Equipo técnico</h2>
        <span class="muted-sm">${list.length} técnicos · ${list.filter((t) => t.activo).length} activos</span>
      </div>
      <button class="btn btn-primary btn-sm" data-new>＋ Nuevo técnico</button>
    </div>
    <div class="grid tech-grid">${cards}${sinCard}</div>`;

  root.querySelector('[data-new]').onclick = () => techFormModal();
  root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const txt = b.dataset.copy;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Acceso copiado')).catch(() => toast('No se pudo copiar', 'info'));
    else toast('No se pudo copiar', 'info');
  }));
  root.querySelectorAll('[data-edit]').forEach((el) => {
    el.onclick = () => {
      const tec = list.find((t) => t.id == el.dataset.edit);
      if (tec) techFormModal(tec);
    };
  });
}
