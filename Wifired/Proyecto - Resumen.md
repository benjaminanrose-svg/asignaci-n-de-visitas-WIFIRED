# WIFIRED — Resumen del proyecto

Sistema web para **asignar y controlar visitas técnicas** de WIFIRED (Melipilla).
Reemplaza la antigua planilla Excel. Objetivo: asignación rápida, visual y fácil.

## Qué es (en simple)
- Una web (SPA, sin framework) + un servidor Node/Express + base de datos PostgreSQL.
- Coordinación asigna visitas arrastrando; los técnicos ven las suyas en el celular.
- Instalable como app en el celular (PWA) con notificaciones push.

## Cómo correrlo
- Local rápido: `npm start` → http://localhost:8080
- Sin `DATABASE_URL` corre en **modo memoria** (no guarda al reiniciar, sirve para demos).
- Con PostgreSQL persiste y es compartido entre todos.

## Roles (login)
- **Coordinación**: administra todo. Usuario `coordinacion`.
- **Técnico**: solo ve sus visitas. Usuario `nombre.apellido`.
- 🔴 Las **contraseñas NO se escriben aquí**. Las de fábrica se cambian con las
  variables de entorno `ADMIN_PASS` / `TECH_PASS` en el servidor. Ver [[Seguridad]].

## Piezas principales
| Archivo/Carpeta | Rol |
|---|---|
| `index.html` | Estructura base |
| `js/app.js` | Router + arranque |
| `js/store.js` | Estado y persistencia (front) |
| `js/views/` | Pantallas: panel, agenda, visitas, técnicos, bodega, tickets, etc. |
| `js/components.js` | Badges, modales, orden de trabajo |
| `server.js` | Servidor + API REST (`/api/*`) |
| `db.js` | Capa de datos (Postgres o memoria) |
| `mailer.js` | Envío de correo (Brevo/Resend) |
| `mikrotik.js` | Integración MikroTik |
| `push.js` | Notificaciones push (VAPID) |
| `bot/` | Bot de WhatsApp |
| `data/seed.json` | 118 órdenes reales del Excel (siembra) |

## Vistas actuales
Panel (indicadores), Agenda/Asignación (arrastrar), Visitas, Técnicos, Clientes,
Calendario, Servicios, Bodega (inventario por N° serie), Tickets, Ubicaciones,
Configuración, Portal Técnico, Login.

## Funciones destacadas
- Asignación arrastrar y soltar; estados con color; búsqueda instantánea.
- Orden de trabajo imprimible (copia cliente/técnico).
- Firmas digitales con el dedo + envío de orden por correo al cerrar.
- Validación con **PIN de 6 dígitos** al correo del cliente para cerrar visita.
- Historial completo por visita + descarga de evidencia en **ZIP**.
- PWA instalable + push (asignación/reagenda).

## Despliegue
- App/`server.js`: fusionar a `main` → Coolify despliega solo.
- Bot (`/opt/wifired/bot`): `git pull` + `pm2 restart wifired-bot`.
- Rama de trabajo: `claude/visit-assignment-web-system-jm2u9e`.

## Correo (importante)
Railway/hosting suele bloquear SMTP → se usa **API HTTP** (Brevo recomendado).
Variables: `BREVO_API_KEY` + `MAIL_FROM`.
