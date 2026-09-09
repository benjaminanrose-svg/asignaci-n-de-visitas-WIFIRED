# MEMORIA_ARQUITECTURA — Registro central de rutas y componentes

> Índice para NO reexplorar el árbol de archivos (ahorro de tokens).
> Se consulta ANTES de buscar, y se ACTUALIZA al crear/modificar/eliminar rutas o archivos.
> Complemento con más detalle de zonas internas: [[Mapa del proyecto]].
> ⚠️ Stack real: **JS puro (sin React, sin `src/`)** + backend Express en un solo `server.js`.

## Frontend — Vistas (rutas hash `#/…`)

| Módulo | Ruta / Vista | Archivo principal | Función / Propósito |
| :-- | :-- | :-- | :-- |
| Panel | `#/panel` | `js/views/panel.js` | Indicadores/estadísticas con selector de período |
| Agenda | `#/agenda` | `js/views/agenda.js` | Tablero de asignación (arrastrar y soltar) |
| Calendario | `#/calendario` | `js/views/calendario.js` | Calendario mensual + zonas. **Modal de día (`dayModal`/`renderDayCols`) = board por técnico** (columnas, `visitCard`, reasignación con selector, modal `.xl`; "Por asignar" solo si `unassigned>0`) |
| Historial | `#/visitas` | `js/views/visitas.js` | Historial de visitas + búsqueda/filtros |
| Clientes | `#/clientes` | `js/views/clientes.js` | **Tabla** (Cliente·Dirección·Plan·Equipos·Estado·Ver ficha) + **filtro por nodo** (`clientNodo`/`pintarNodos`). Clientes = agrupación visitas+servicios por `clientKey` (RUT→tel→nombre), no hay tabla real |
| Tickets | `#/tickets` | `js/views/tickets.js` | Tickets (entran por el bot de WhatsApp) |
| Servicios | `#/servicios` | `js/views/servicios.js` | Servicios/planes + broadcasts + cortes |
| **Bodega** | `#/bodega` | `js/views/bodega.js` | Inventario: acordeón + tabla + **escáner en DRAWER** (`openScanner`: botones 📥 Ingresar / 📤 Despachar; badge verde+beep+contador) |
| Técnicos | `#/tecnicos` | `js/views/tecnicos.js` | Alta y desempeño de técnicos |
| Ubicaciones | `#/ubicaciones` | `js/views/ubicaciones.js` | Mapa de ubicación de técnicos |
| Configuración | `#/config` | `js/views/config.js` | **4 pestañas** (Empresa·General / Red·Nodos / Agendamiento / Sistema): tarjetas con `data-group`, `setTab` muestra el grupo activo, **Guardar global** intacto. Tipos, bloques, estados, nodos (+zona por nodo), empresa |
| Portal técnico | (rol técnico) | `js/views/tecnico.js` | Solo sus visitas (móvil) |
| Login | (sin sesión) | `js/views/login.js` | Inicio de sesión |

### Frontend — Núcleo (no-vistas)
| Componente | Archivo | Propósito |
| :-- | :-- | :-- |
| Router + arranque | `js/app.js` | Tabla `ROUTES`, auto-refresco, campana/badges |
| Estado + API | `js/store.js` | Todo el estado y llamadas al API (`updateVisita`, `addInventario`, etc.) |
| Helpers | `js/util.js` | Fechas, `esc`, `toast`, RUT, teléfono, `mapsHref`, `bindField`, **`clientKey`/`normName`** (cliente), **`zonaDeVisita`/`zonaDeNodo`/`ZONAS`/`setNodoZonas`** (zona: config nodo → respaldo por nombre → técnico). Config persiste en `config.nodosZona` (db.js `loadConfig`); store la inyecta vía `setNodoZonas` en `applyCompany` |
| Componentes | `js/components.js` | Modales, detalle de visita, orden de trabajo. **`visitCard`** (tarjeta rica: OT·prioridad·bloque·cliente·estado·**zona**). `clientCardModal` → "📦 Equipos instalados" (`cargarEquiposCliente`) |
| Formularios | `js/form.js`, `js/techform.js` | Crear/editar visita · form del técnico. **`js/form.js` = autocompletado de clientes** (`setupClienteAutocomplete`: dropdown por nombre/RUT/dirección, badge 🟢 registrado/🔵 nuevo, `syncCliente` actualiza el servicio si cambió; la visita crea/refleja al cliente en Clientes) |
| Otros | `js/signature.js` `js/photos.js` `js/zip.js` `js/push.js` | Firma · **evidencia (`createPhotoPicker`: sin límite de peso; video ≤30s; grabación en-app con auto-stop 30s `grabarVideoEnApp`)** · ZIP · push |
| PWA | `sw.js` | Service worker + caché versionada (**subir `vXX` al tocar CSS/JS**) |
| Estilos | `css/base.css` `css/layout.css` `css/components.css` | Bodega: buscar `.bod-acc`, `.bod-tbl`, `.bod-scan` |

## Backend — API (todas en `server.js`, prefijo `/api`)

| Módulo | Ruta API | Archivo | Función / Propósito |
| :-- | :-- | :-- | :-- |
| Sesión | `POST /login`, `GET /me`, `GET /bootstrap` | `server.js` (+`server-auth.js`) | Login, usuario actual, carga inicial |
| Visitas | `POST/PUT/DELETE /visitas[/:id]` | `server.js` | CRUD de visitas |
| Visitas | `GET /visitas/:id/orden.pdf`, `POST …/enviar-pin`, `…/enviar-orden` | `server.js` (+`mailer.js`) | Orden PDF, PIN al cliente, envío de orden |
| Config | `GET/PUT /config` | `server.js` | Configuración del sistema |
| Servicios | `GET/POST/PUT/DELETE /servicios[/:id]`, `/import`, `/broadcast` | `server.js` | Planes, importación, comunicados |
| Servicios | `POST /servicios/:id/(cortar\|activar)`, `GET /router/estado` | `server.js` (+`mikrotik.js`) | Corte/activación en MikroTik |
| **Bodega** | `GET/POST/PUT/DELETE /inventario[/:id]` | `server.js` | CRUD de equipos. **Escaneo = `POST /inventario`** (no hay endpoint aparte) |
| **Bodega** | `POST /inventario/:id/mover` | `server.js` | Cambia estado (entregar/instalar/devolver/baja) + historial |
| **Bodega** | *(Modo Despacho — sin endpoint nuevo)* | `js/views/bodega.js` | `registrarDespacho()` usa `POST /inventario` (crear) + `/mover` acción `entregar`. Panel sesión: `addSesion`/`pintarSesion`/`finalizarEntrega` |
| Tickets | `GET/POST/PUT/DELETE /tickets[/:id]`, `…/enviar-planes` | `server.js` | Tickets + envío de planes |
| Bot | `POST /bot/*`, `GET /bot/*` (requireBotKey) | `server.js` | Puente con el bot de WhatsApp (outbox) |
| Técnicos | `GET/POST/PUT/DELETE /tecnicos[/:id]`, `/ubicacion(es)` | `server.js` | CRUD técnicos + GPS |
| Push | `GET /push/config`, `POST /push/subscribe` | `server.js` (+`push.js`) | Notificaciones push (VAPID) |

### Backend — Datos y despliegue
| Pieza | Archivo | Propósito |
| :-- | :-- | :-- |
| Capa de datos | `db.js` | PostgreSQL o memoria. `memoryStore`/`pgStore`, `loadConfig` |
| Correo | `mailer.js` | Brevo/Resend |
| MikroTik | `mikrotik.js` | Estado, cortar/activar |
| Siembra | `data/seed.json` | 118 OT del Excel |
| Bot WhatsApp | `bot/whatsapp-bot.js` | Baileys, PM2 `wifired-bot`, sesión `auth_wifired` |

> **Vínculo equipo↔cliente:** se reusa el campo existente `inventario.cliente` (nombre),
> NO se creó `cliente_id`. El modal "Marcar como instalado" (`accionModal`/`indexClientes`
> en `bodega.js`) tiene un picker que busca clientes (visitas+servicios) y guarda el nombre.
> La ficha y el contador de Clientes cruzan por `normName(cliente)`.

> **Nota Bodega:** la categoría NO tiene endpoint propio ni enum en backend. La
> clasificación por prefijo de código vive en el frontend (`bodega.js` → `REGLAS_CODIGO`,
> `porCodigo`, `clasificar`). La columna `inventario.categoria` es TEXT libre.
