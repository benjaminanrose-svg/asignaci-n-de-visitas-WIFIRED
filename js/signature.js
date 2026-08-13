// ============================================================
// WIFIRED · Pad de firma digital (táctil / mouse)
// Fondo blanco + tinta oscura → firma lista para orden/correo.
// ============================================================
export function createSignaturePad(label) {
  const wrap = document.createElement('div');
  wrap.className = 'sigpad';
  wrap.innerHTML = `
    <div class="sigpad-head"><span class="sigpad-label">${label || 'Firma'}</span>
      <button type="button" class="sigpad-clear">Borrar</button></div>
    <canvas class="sigpad-canvas" width="600" height="180"></canvas>`;
  const canvas = wrap.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let empty = true;

  function reset() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    empty = true;
  }
  reset();

  let drawing = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); drawing = true; empty = false; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  wrap.querySelector('.sigpad-clear').onclick = () => reset();

  return { element: wrap, getData: () => (empty ? '' : canvas.toDataURL('image/png')), isEmpty: () => empty };
}
