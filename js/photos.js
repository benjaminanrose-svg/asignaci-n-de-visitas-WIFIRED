// ============================================================
// WIFIRED · Selector de evidencia (fotos, pantallazos y video ≤30s)
// Las fotos se comprimen en el navegador (funciona offline).
// ============================================================
import { toast } from './util.js';

const VIDEO_MAX_SEG = 30;                 // duración máxima permitida
const VIDEO_MAX_BYTES = 20 * 1024 * 1024; // ~20 MB por video (evita archivos gigantes)

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

/** Crea un componente para capturar/seleccionar fotos y videos. Devuelve { element, getPhotos } */
export function createPhotoPicker() {
  const wrap = document.createElement('div');
  wrap.className = 'photo-picker';
  wrap.innerHTML = `
    <label class="photo-btn">📷 Agregar foto o video
      <input type="file" accept="image/*,video/*" multiple hidden>
    </label>
    <div class="photo-previews"></div>`;
  const input = wrap.querySelector('input');
  const prev = wrap.querySelector('.photo-previews');
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

  input.onchange = async () => {
    const label = wrap.querySelector('.photo-btn');
    label.classList.add('loading');
    for (const file of Array.from(input.files)) {
      if (file.type.startsWith('video/')) {
        const dur = await videoDuracion(file);
        if (dur > VIDEO_MAX_SEG + 0.5) { toast(`El video debe durar máximo ${VIDEO_MAX_SEG} segundos`, 'info'); continue; }
        if (file.size > VIDEO_MAX_BYTES) { toast('El video es muy pesado (máx ~20 MB). Grábalo más corto o en menor calidad', 'info'); continue; }
        const dataUrl = await readDataURL(file);
        if (dataUrl) addThumb(dataUrl, true);
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await compress(file);
        if (dataUrl) addThumb(dataUrl, false);
      }
    }
    input.value = '';
    label.classList.remove('loading');
  };

  return { element: wrap, getPhotos: () => photos.slice() };
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
