# Mapa del proyecto — dónde tocar cada cosa

> Índice para NO leer todo cada vez. "Si quiero cambiar X → voy a Y".
> Mantener actualizado cuando se agreguen archivos/rutas.

## Regla de oro al cambiar la web
Si tocas **CSS o JS del front**, sube la versión del caché en `sw.js`
(línea 6: `const CACHE = 'wifired-vXX'`). Hoy va en **v52**.

---

## Frontend (carpeta `js/`)

### Arranque y navegación
- `js/app.js` — router + arranque. Aquí está la tabla `ROUTES` (línea 25): qué vista
  se muestra en cada `#/ruta`. También: campana de reagendas, badge de tickets,
  auto-refresco cada 8s, backup, búsqueda global.
- `index.html` — layout base (sidebar, topbar, contenedor `#view`).
- `js/auth.js` — login/logout en el front (token).

### Estado y datos (el "cerebro" del front)
- `js/store.js` — TODO el estado y las llamadas al API. Si necesitas datos o una acción
  (crear/editar/borrar visita, técnico, ticket, servicio, inventario) la función está aquí.
  Ej: `updateVisita`, `addVisita`, `addTecnico`, `addTicket`, `broadcast`, `listInventario`.
  Getters de config: `tipos()`, `bloques()`, `estados()`, `prioridades()`, `nodos()`.
- `js/util.js` — helpers reutilizables. Antes de crear uno, mira aquí:
  fechas (`fmtDate`, `todayISO`, `addDays`), `esc` (seguridad HTML), `toast` (avisos),
  RUT (`validaRut`, `formatRut`), teléfono (`validaFono`, `telLink`, `waLink`),
  Maps (`mapsHref`), email (`validaEmail`), `bindField` (validar inputs en vivo).

### Componentes y formularios (compartidos)
- `js/components.js` — badges, avatares, **modales**, **detalle de visita**, **orden de
  trabajo** (imprimible). Si cambias cómo se ve una visita al abrirla o la orden → aquí.
- `js/form.js` — formulario de crear/editar/asignar visita.
- `js/techform.js` — formulario del técnico (al completar).
- `js/signature.js` — firma con el dedo.
- `js/photos.js` — subir/comprimir fotos (evidencia).
- `js/zip.js` — armar el ZIP de evidencia.
- `js/push.js` — registrar service worker + notificaciones push (front).

### Vistas (carpeta `js/views/`) — cada pantalla
| Ruta (#/) | Archivo | Qué es |
|---|---|---|
| panel | `panel.js` | Indicadores/estadísticas con selector de período |
| agenda | `agenda.js` | Tablero de asignación (arrastrar y soltar) |
| calendario | `calendario.js` | Vista de calendario |
| visitas | `visitas.js` | Historial con búsqueda y filtros |
| clientes | `clientes.js` | Clientes |
| tickets | `tickets.js` | Tickets (entran por el bot de WhatsApp) |
| servicios | `servicios.js` | Servicios/planes + broadcasts + cortes |
| bodega | `bodega.js` | Inventario de equipos por N° de serie |
<!-- Zonas dentro de bodega.js (para no releer todo): -->
<!-- · CATS (4 categorías estándar) → ~línea 11 · EST (estados) → ~línea 13 -->
<!-- · MOTOR CLASIFICACIÓN: REGLAS_CODIGO (prefijos fabricante, orden=prioridad) -->
<!--   porCodigo(cod)→cat|null · porTexto(txt)→cat|null · clasificar(item)=código>canónica>texto>'Routers' -->
<!--   Regla: clasificar SIEMPRE devuelve 1 de 4 (suma=Total). Código conocido MANDA sobre lo guardado. -->
<!-- · Escáner = DRAWER lateral (openScanner): cabecera "📥 Ingresar equipos" / "📤 Despachar a técnico" -->
<!--   ingreso→registrarEscaneo (En bodega); despacho→registrarDespacho (selector técnico obligatorio) -->
<!--   badge()=verde+beep, renderCounter()=contador sesión, mostrarAjuste/ajustarCategoria (1-clic) -->
<!-- · catOptions() (opciones del <select> de categoría) -->
<!-- · paint() (cabecera + pills + filtros + contenedor secciones) -->
<!-- · pintarSecciones() (ACORDEÓN: una sección por categoría, colapsable) -->
<!--   local.cerradas = Set de categorías colapsadas -->
<!-- · tablaHtml()/rowHtml() (TABLA: Código|Estado|Asignado a|Acciones Ver/Editar) -->
<!-- · pasaFiltro() (busca + filtro de estado) · ubicacionTxt() (Asignado a) -->
<!-- · formModal() (Nuevo/Editar, select categoría) · acciones()/accionModal() (mover) -->
<!-- Categorías = solo frontend (CATS). Backend NO valida (col. TEXT default 'Decos'). -->
<!-- Estilos CSS de bodega: css/components.css → buscar ".bod-acc" y ".bod-tbl" -->

| tecnicos | `tecnicos.js` | Alta y desempeño de técnicos |
| ubicaciones | `ubicaciones.js` | Mapa de ubicación de técnicos |
| config | `config.js` | Tipos, bloques, estados, nodos, datos empresa |
| (técnico) | `tecnico.js` | Portal del técnico (solo sus visitas, móvil) |
| (login) | `login.js` | Pantalla de inicio de sesión |

---

## Backend (raíz del proyecto)

- `server.js` — servidor Express + **todas las rutas API** (`/api/*`). Mapa de rutas abajo.
- `db.js` — capa de datos (PostgreSQL o memoria). Aquí viven las funciones que leen/graban
  en la base: `memoryStore` (línea 227) y `pgStore` (línea 420). Config del sistema:
  `loadConfig` / `saveConfigWith`. Si cambias la forma de guardar datos → aquí.
- `mailer.js` — envío de correos (Brevo/Resend, orden firmada, PIN).
- `mikrotik.js` — integración con routers MikroTik (estado, cortar/activar).
- `push.js` (raíz) — notificaciones push del servidor (VAPID).
- `server-auth.js` — auth del servidor (tokens, contraseñas scrypt+salt).
- `data/seed.json` — datos de siembra (118 OT del Excel).
- `sw.js` — service worker (PWA + caché versionada).

### Mapa de rutas API (`server.js`) — "para X, uso la ruta Y"
Todas cuelgan de `/api`. Auth: `auth` = logueado, `soloCoordinador` = solo coordinación,
`requireBotKey` = solo el bot (con BOT_API_KEY).

- **Sesión/arranque:** `POST /login`, `GET /me`, `POST /mi-clave`, `GET /bootstrap`, `GET /rev`
- **Visitas:** `POST /visitas`, `POST /visitas/orden`, `PUT /visitas/:id`, `DELETE /visitas/:id`,
  `GET /visitas/:id/orden.pdf`, `POST /visitas/:id/enviar-pin`, `POST /visitas/:id/enviar-orden`,
  `POST /visitas/:id/confirmar-ahora`, `POST /visitas/limpiar-todo`
- **Config:** `GET/PUT /config`
- **Servicios:** `GET/POST /servicios`, `PUT/DELETE /servicios/:id`, `POST /servicios/import`,
  `POST /servicios/broadcast` (+ `/broadcast/pendientes`, `/broadcast/cancelar`),
  `POST /servicios/:id/(cortar|activar)`
- **Inventario (bodega):** `GET/POST /inventario`, `PUT/DELETE /inventario/:id`, `POST /inventario/:id/mover`
- **Contactos:** `GET /contactos`, `POST /contactos/marcar`
- **Router/MikroTik:** `GET /router/estado`
- **Backup:** `GET /backup`
- **Tickets:** `GET/POST /tickets`, `PUT/DELETE /tickets/:id`, `POST /tickets/:id/enviar-planes`
- **Bot (requireBotKey):** `POST /bot/ticket`, `/bot/plan-elegido`, `/bot/contratacion-datos`,
  `/bot/confirmar-visita`, `/bot/contacto`; `GET /bot/config`, `/bot/outbox`, `/bot/media/:id`,
  `/bot/visita`; `POST /bot/outbox/:id/sent`
- **Técnicos:** `GET/POST /tecnicos`, `PUT/DELETE /tecnicos/:id`, `GET /tecnicos/ubicaciones`,
  `POST /tecnico/ubicacion`
- **Push:** `GET /push/config`, `POST /push/subscribe`
- **Salud:** `GET /health`

---

## Bot de WhatsApp (carpeta `bot/`)
- `bot/whatsapp-bot.js` — el bot (Baileys). Menú fijo, broadcasts, filtro por nodo,
  patrón "outbox" (la web deja mensajes en `/bot/outbox`, el bot los envía).
- Corre con PM2 (`wifired-bot`), sesión en `auth_wifired`.
- ⚠️ La categoría "Contratación" NO se renombra (dispara la lógica de factibilidad).

---

## Despliegue (recordatorio)
- Web: fusionar a `main` → Coolify publica solo.
- Bot: en el servidor `git pull` + `pm2 restart wifired-bot`.
- Rama de trabajo: `claude/visit-assignment-web-system-jm2u9e`.
