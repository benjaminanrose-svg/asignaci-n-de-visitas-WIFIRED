// ============================================================
// WIFIRED · Generador de ZIP en el navegador (sin dependencias)
// Método STORE (sin compresión) — suficiente para empaquetar
// fotos/firmas (ya comprimidas) y documentos HTML de evidencia.
// ============================================================

// Tabla CRC-32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

/** Convierte un data URI (base64) a { bytes, mime, ext } */
export function dataUriToBytes(uri) {
  const m = /^data:([^;,]*)?(;base64)?,(.*)$/s.exec(uri || '');
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const isB64 = !!m[2];
  const raw = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'text/html': 'html' })[mime] || 'bin';
  return { bytes, mime, ext };
}

/** Construye un ZIP (Uint8Array) desde [{ name, data:Uint8Array }] */
export function makeZip(files) {
  const parts = [];       // trozos del archivo
  const central = [];     // encabezados del directorio central
  let offset = 0;

  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
    const crc = crc32(data);
    const flag = 0x0800; // nombres en UTF-8

    // Encabezado local
    const local = concat([
      u32(0x04034b50), u16(20), u16(flag), u16(0), // firma, versión, flag, método(0=store)
      u16(0), u16(0),                               // hora, fecha (0)
      u32(crc), u32(data.length), u32(data.length), // crc, tam comprimido, tam sin comprimir
      u16(nameBytes.length), u16(0),                // largo nombre, largo extra
      nameBytes,
    ]);
    parts.push(local, data);

    // Entrada del directorio central
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(flag), u16(0),
      u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0),        // nombre, extra, comentario
      u16(0), u16(0), u32(0),                        // disco, atrib int, atrib ext
      u32(offset),                                  // desplazamiento del encabezado local
      nameBytes,
    ]));
    offset += local.length + data.length;
  }

  const cd = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(cd.length), u32(offset),
    u16(0),
  ]);
  return concat([...parts, cd, end]);
}

function concat(arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let p = 0;
  for (const a of arrs) { out.set(a, p); p += a.length; }
  return out;
}

/** Genera y descarga un ZIP */
export function downloadZip(filename, files) {
  const zip = makeZip(files);
  const blob = new Blob([zip], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
