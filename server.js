// ============================================================
// WIFIRED · Servidor estático mínimo (sin dependencias)
// Sirve la SPA para hosting (Railway, Render, etc.)
// Escucha en process.env.PORT y enlaza a 0.0.0.0
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function safeJoin(base, target) {
  // Evita path traversal (../)
  const resolved = path.normalize(path.join(base, target));
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    let filePath = safeJoin(ROOT, urlPath);
    if (!filePath) {
      res.writeHead(400); res.end('Bad request'); return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        // Fallback a index.html (soporta rutas y refrescos)
        filePath = path.join(ROOT, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      fs.createReadStream(filePath)
        .on('error', () => { res.writeHead(500); res.end('Server error'); })
        .pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WIFIRED Agenda — servidor activo en http://${HOST}:${PORT}`);
});
