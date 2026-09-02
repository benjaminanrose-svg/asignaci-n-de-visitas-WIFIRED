// ============================================================
// WIFIRED · Selector de evidencia (fotos, pantallazos y video ≤30s)
// Las fotos se comprimen en el navegador (funciona offline).
// ============================================================
import { toast } from './util.js';

const VIDEO_MAX_SEG = 30; // duración máxima permitida (sin límite de peso/tamaño)

function loadImg(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

async function compress(file, max = 1200, q = 0.6) {
  try {
    const img = await loadImg(file);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q);
  } catch (e) { return null; }
}

function readDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej; r.readAsDataURL(file);
  });
}

/** Devuelve la duración del video en segundos (0 si no se pudo leer). */
function videoDuracion(file) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => { const d = vid.duration; URL.revokeObjectURL(url); res(isFinite(d) ? d : 0); };
    vid.onerror = () => { URL.revokeObjectURL(url); res(0); };
    vid.src = url;
  });
}

/** ¿El navegador puede grabar video dentro de la app? */
function soportaGrabacion() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

/** Crea un componente para capturar/seleccionar fotos y videos. Devuelve { element, getPhotos } */
export function createPhotoPicker() {
  const wrap = document.createElement('div');
  wrap.className = 'photo-picker';
  wrap.innerHTML = `
    <div class="photo-btns">
      <label class="photo-btn">📷 Tomar foto
        <input type="file" accept="image/*" capture="environment" hidden data-in="foto">
      </label>
      <button type="button" class="photo-btn" data-rec>🎥 Grabar video</button>
      <label class="photo-btn photo-btn-2">🖼️ Galería
        <input type="file" accept="image/*,video/*" multiple hidden data-in="galeria">
      </label>
      <input type="file" accept="video/*" capture="environment" hidden data-in="videofb">
    </div>
    <div class="photo-previews"></div>`;
  const prev = wrap.querySelector('.photo-previews');
  const btns = wrap.querySelector('.photo-btns');
  const photos = [];

  const addThumb = (dataUrl, esVideo) => {
    photos.push(dataUrl);
    const t = document.createElement('div');
    t.className = 'photo-thumb';
    const media = esVideo
      ? `<video src="${dataUrl}" muted playsinline></video><span class="photo-play">▶</span>`
      : `<img src="${dataUrl}" alt="evidencia">`;
    t.innerHTML = `${media}<button type="button" class="photo-del" title="Quitar">✕</button>`;
    t.querySelector('.photo-del').onclick = () => {
      const i = photos.indexOf(dataUrl);
      if (i >= 0) photos.splice(i, 1);
      t.remove();
    };
    prev.appendChild(t);
  };

  // Procesa archivos elegidos (foto o galería). Sin límite de peso; los videos
  // se validan SOLO por duración (≤30s).
  const procesar = async (files) => {
    btns.classList.add('loading');
    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const dur = await videoDuracion(file);
        if (dur > VIDEO_MAX_SEG + 0.5) { toast('El video no puede superar los 30 segundos de duración', 'info'); continue; }
        const dataUrl = await readDataURL(file);
        if (dataUrl) addThumb(dataUrl, true);
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await compress(file);
        if (dataUrl) addThumb(dataUrl, false);
      }
    }
    btns.classList.remove('loading');
  };
  wrap.querySelectorAll('input[type=file]').forEach((input) => (input.onchange = async () => { await procesar(input.files); input.value = ''; }));

  // Grabar video dentro de la app con auto-stop a 30s. Si el navegador no lo
  // soporta, cae a la cámara nativa (input capture de respaldo).
  wrap.querySelector('[data-rec]').onclick = async () => {
    if (!soportaGrabacion()) { wrap.querySelector('[data-in="videofb"]').click(); return; }
    try {
      const dataUrl = await grabarVideoEnApp();
      if (dataUrl) addThumb(dataUrl, true);
    } catch (e) {
      toast((e && e.message) || 'No se pudo grabar; abre la cámara', 'info');
      wrap.querySelector('[data-in="videofb"]').click();
    }
  };

  return { element: wrap, getPhotos: () => photos.slice() };
}

/**
 * Graba video con la cámara dentro de la app y se DETIENE SOLO a los 30 s.
 * Devuelve el dataURL del video, o null si se cancela. Sin límite de peso.
 */
function grabarVideoEnApp() {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true }).then((stream) => {
      const ov = document.createElement('div');
      ov.className = 'rec-overlay';
      ov.innerHTML = `
        <video class="rec-video" autoplay playsinline muted></video>
        <div class="rec-bar">
          <span class="rec-dot"></span>
          <span class="rec-time" data-time>0:00 / 0:30</span>
          <div class="rec-actions">
            <button type="button" class="btn" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-primary" data-stop>⏹ Detener y usar</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      ov.querySelector('.rec-video').srcObject = stream;

      let mime = '';
      ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].some((m) => (window.MediaRecorder.isTypeSupported(m) ? (mime = m, true) : false));
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

      let cerrado = false, timer = null, tick = null;
      const limpiar = () => { if (timer) clearTimeout(timer); if (tick) clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); ov.remove(); };
      const cancelar = () => { if (cerrado) return; cerrado = true; try { rec.stop(); } catch (e) {} limpiar(); resolve(null); };
      const detener = () => { if (cerrado) return; try { rec.stop(); } catch (e) { limpiar(); resolve(null); } };
      rec.onstop = () => {
        if (cerrado) return; // cancelado: no producir video
        cerrado = true;
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' });
        limpiar();
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.readAsDataURL(blob);
      };

      ov.querySelector('[data-stop]').onclick = detener;
      ov.querySelector('[data-cancel]').onclick = cancelar;

      const t0 = Date.now();
      tick = setInterval(() => {
        const s = Math.min(Math.floor((Date.now() - t0) / 1000), VIDEO_MAX_SEG);
        const el = ov.querySelector('[data-time]');
        if (el) el.textContent = `0:${String(s).padStart(2, '0')} / 0:30`;
      }, 200);
      timer = setTimeout(() => { toast('Máximo 30 segundos: grabación detenida', 'info'); detener(); }, VIDEO_MAX_SEG * 1000);
      rec.start();
    }).catch(() => reject(new Error('No se pudo acceder a la cámara')));
  });
}

/** Lightbox para ver una foto o video en grande */
export function openPhoto(url) {
  const ov = document.createElement('div');
  ov.className = 'photo-lightbox';
  const esVideo = String(url || '').startsWith('data:video');
  ov.innerHTML = esVideo
    ? `<video src="${url}" controls autoplay playsinline></video><button class="photo-close">✕</button>`
    : `<img src="${url}" alt="evidencia"><button class="photo-close">✕</button>`;
  const close = () => ov.remove();
  // En video, no cerrar al tocar el reproductor (para poder usar los controles)
  ov.onclick = (e) => { if (!esVideo || e.target === ov || e.target.className === 'photo-close') close(); };
  document.body.appendChild(ov);
}
