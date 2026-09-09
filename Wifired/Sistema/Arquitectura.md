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

## ⚡ Carga rápida (por qué la app abre liviana)
`/api/bootstrap` manda las visitas **sin las fotos ni firmas** (función
`aligerarVisita` en `server.js`). Las fotos se piden **al abrir cada visita**
con `GET /visitas/:id/media` (`store.conMedia`).

- **No se borra nada**: todo sigue en la base. El **respaldo** (`/backup`) y la
  **orden de trabajo en PDF** usan los datos completos.
- Se conserva la **cantidad** de fotos (arreglos del mismo largo), así los
  contadores 📷 siguen funcionando sin cambios.
- La caché del navegador también se guarda liviana (no revienta el límite).

> 🔴 **Regla dura:** nunca reescribir `historial` ni `evidencias` partiendo de la
> versión liviana — se perderían las fotos. Por eso `store.updateVisita` tiene una
> **barrera**: si faltan los archivos, avisa y NO guarda. Antes de cualquier
> acción que escriba historial hay que llamar a `store.conMedia(v)`.

Relacionado: [[Base de datos]] · [[Vistas]]
