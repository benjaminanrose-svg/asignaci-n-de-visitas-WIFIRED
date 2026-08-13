// ============================================================
// WIFIRED · Selector de evidencia fotográfica
// Comprime en el navegador (funciona offline; se guarda en la cola)
// ============================================================

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

/** Crea un componente para capturar/seleccionar fotos. Devuelve { element, getPhotos } */
export function createPhotoPicker() {
  const wrap = document.createElement('div');
  wrap.className = 'photo-picker';
  wrap.innerHTML = `
    <label class="photo-btn">📷 Agregar foto
      <input type="file" accept="image/*" capture="environment" multiple hidden>
    </label>
    <div class="photo-previews"></div>`;
  const input = wrap.querySelector('input');
  const prev = wrap.querySelector('.photo-previews');
  const photos = [];

  input.onchange = async () => {
    const label = wrap.querySelector('.photo-btn');
    label.classList.add('loading');
    for (const file of Array.from(input.files)) {
      const dataUrl = await compress(file);
      if (!dataUrl) continue;
      photos.push(dataUrl);
      const t = document.createElement('div');
      t.className = 'photo-thumb';
      t.innerHTML = `<img src="${dataUrl}" alt="evidencia"><button type="button" class="photo-del" title="Quitar">✕</button>`;
      t.querySelector('.photo-del').onclick = () => {
        const i = photos.indexOf(dataUrl);
        if (i >= 0) photos.splice(i, 1);
        t.remove();
      };
      prev.appendChild(t);
    }
    input.value = '';
    label.classList.remove('loading');
  };

  return { element: wrap, getPhotos: () => photos.slice() };
}

/** Lightbox para ver una foto en grande */
export function openPhoto(url) {
  const ov = document.createElement('div');
  ov.className = 'photo-lightbox';
  ov.innerHTML = `<img src="${url}" alt="evidencia"><button class="photo-close">✕</button>`;
  const close = () => ov.remove();
  ov.onclick = close;
  document.body.appendChild(ov);
}
