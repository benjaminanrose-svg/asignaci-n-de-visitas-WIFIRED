# Arquitectura

App de una sola página (**SPA**) en **JavaScript puro** (sin frameworks).

## Piezas
- **Frontend**: `index.html` + `js/` (vistas en `js/views/`, estado en `js/store.js`).
- **Backend**: `server.js` (Express) — API en `/api/...`.
- **Datos**: `db.js` (PostgreSQL, con respaldo en memoria si no hay DB).
- **PWA**: `sw.js` (service worker, caché versionada `wifired-vNN`). Al cambiar
  CSS/JS hay que **subir esa versión** o los cambios no aparecen.
- **Estilos**: `css/base.css` (variables/tema), `layout.css`, `components.css`.

## Otros archivos
- `bot/` → [[Bot WhatsApp]]
- `mailer.js` (correos), `mikrotik.js` (routers), `push.js` (notificaciones).

Relacionado: [[Base de datos]] · [[Vistas]] · [[Despliegue]]
