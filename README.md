# WIFIRED · Agenda de Visitas Técnicas

Sistema web para la **asignación y control de visitas técnicas** de WIFIRED (Melipilla).
Reemplaza y mejora la planilla Excel `Agenda_Visitas_Melipilla_Wifired.xlsx`, con foco en que la
asignación de visitas sea **rápida, visual y fácil de entender**.

> Esta es una **propuesta de diseño para presentar en localhost**. No requiere instalación de
> dependencias ni conexión a bases de datos: los datos se guardan en el navegador (localStorage)
> y vienen sembrados con las 118 órdenes de trabajo reales del Excel.

---

## Cómo ejecutarlo (localhost)

No necesita compilación. Solo un servidor estático. Dentro de la carpeta del proyecto:

```bash
# Opción 1 — Python (viene en casi todos los equipos)
python3 -m http.server 8000

# Opción 2 — Node
npx serve .
```

Luego abrir en el navegador: **http://localhost:8000**

También se incluye un servidor Node sin dependencias (el mismo que se usa en producción):

```bash
npm start          # sirve en http://localhost:8080 (o el puerto de la variable PORT)
```

> Debe abrirse mediante un servidor (`http://…`), no con doble clic al archivo (`file://`),
> porque la app usa módulos JavaScript.

---

## Despliegue en Railway

El proyecto ya viene listo para Railway (u otro hosting tipo Render/Fly). Usa un servidor
estático en Node **sin dependencias** (`server.js`) que escucha en el puerto que asigna la
plataforma (`process.env.PORT`).

**Pasos:**
1. En Railway: **New Project → Deploy from GitHub repo** y elegir este repositorio
   (rama `claude/visit-assignment-web-system-jm2u9e` o la que se haya fusionado).
2. Railway detecta `package.json` automáticamente (Nixpacks), instala y ejecuta `npm start`.
3. En **Settings → Networking → Generate Domain** para obtener la URL pública.

No hay que configurar variables de entorno: Railway inyecta `PORT` y el servidor lo toma solo.

Archivos relevantes para el despliegue:

| Archivo | Rol |
|---------|-----|
| `server.js` | Servidor estático Node (cero dependencias, respeta `PORT`, MIME correctos, guard anti path-traversal). |
| `package.json` | Script `start` y versión de Node (`>=18`). |
| `railway.json` | Builder Nixpacks + comando de inicio y política de reinicio. |

### Base de datos PostgreSQL (persistencia compartida)

El sistema ya tiene backend (Express) con **PostgreSQL**. Para activarlo en Railway:

1. En el proyecto de Railway: **New → Database → Add PostgreSQL**.
2. Railway crea la variable `DATABASE_URL` y la comparte automáticamente con el servicio web
   (si no, en el servicio web → **Variables → Reference** la variable `DATABASE_URL` de la DB).
3. Redeploy. Al arrancar, el servidor crea las tablas (`tecnicos`, `visitas`) y las **siembra
   una sola vez** con los datos del Excel. A partir de ahí, todo se guarda en la base de datos y
   es compartido entre todos los usuarios.

> **Sin `DATABASE_URL`** (por ejemplo en local sin Postgres) el servidor arranca en **modo
> memoria**: funciona igual, sembrado con los datos del Excel, pero los cambios no persisten al
> reiniciar. Ideal para desarrollo y demos rápidas.

## Arquitectura

- **Frontend**: SPA (HTML/CSS/JS sin framework) que consume la API REST.
- **Backend**: `server.js` (Express) sirve la SPA y expone `/api/*`.
- **Datos**: `db.js` — capa única con dos modos (PostgreSQL o memoria).

### API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/bootstrap` | Carga inicial (visitas + técnicos + configuración). |
| GET/POST | `/api/visitas` | Listar / crear visitas. |
| PUT/DELETE | `/api/visitas/:id` | Actualizar / eliminar visita. |
| GET/POST | `/api/tecnicos` | Listar / crear técnicos. |
| PUT/DELETE | `/api/tecnicos/:id` | Actualizar / eliminar técnico. |

---

## Qué incluye

| Vista | Para qué sirve |
|-------|----------------|
| **Panel** | Indicadores clave (total, pendientes, programadas, completadas, reprogramadas), carga de trabajo por técnico, distribución por estado y próximas visitas. |
| **Agenda / Asignación** | Tablero visual por día. Se **arrastra** una visita desde "Por asignar" hacia el técnico, o se reorganiza por bloque horario. Navegación por fecha. |
| **Visitas** | Registro completo con búsqueda y filtros por estado, técnico, bloque y tipo. |
| **Técnicos** | Carga y desempeño de cada técnico. |
| **Orden de trabajo** | Ficha imprimible (copia cliente / técnico) desde cualquier visita, con el formato de WIFIRED. |

### Mejoras respecto al Excel
- Asignación por **arrastrar y soltar** en lugar de copiar/pegar celdas.
- **Estados con color** para leer de un vistazo (pendiente, programada, completada, reprogramada, cancelada).
- **Búsqueda instantánea** por cliente, OT, dirección o teléfono.
- **Indicadores automáticos** que antes se calculaban a mano.
- Orden de trabajo lista para **imprimir** sin salir del sistema.

---

## Estructura

```
index.html            Estructura y layout base
css/                  base (tokens/tipografía) · layout · componentes
js/
  app.js              Router + arranque
  store.js            Estado y persistencia (localStorage)
  util.js             Helpers (fechas, colores, formato)
  components.js       Badges, avatares, modales, orden de trabajo
  form.js             Formulario de crear/editar/asignar visita
  views/              panel · agenda · visitas · tecnicos
data/seed.js          118 OT reales extraídas del Excel
```

## Datos y reinicio
Los cambios (asignaciones, nuevas visitas, ediciones) se guardan en el navegador.
Para volver a los datos originales del Excel, ejecutar en la consola del navegador:

```js
localStorage.removeItem('wifired_agenda_v1'); location.reload();
```

---

*Propuesta de diseño — WIFIRED Ltda., Melipilla.*

## Acceso / Roles (login)

El sistema ahora tiene inicio de sesión con dos roles:

- **Coordinación**: ve y administra todo (agenda, asignación, calendario, técnicos). Al asignar una visita queda registrado quién la asignó.
- **Técnico**: al entrar ve **solo sus visitas asignadas** (portal simple, pensado para celular) y puede marcar **Completada**, **Reagendar** o dejar una **Nota**.

### Credenciales iniciales
- **Coordinación** → usuario `coordinacion` · contraseña `wifired2026`
- **Técnicos** → usuario `nombre.apellido` (ej. `moises.santana`, `jeremy.jimenez`) · contraseña `wifired`

> Cada técnico creado desde el panel genera automáticamente su usuario (`nombre.apellido`, contraseña `wifired`).
> Cambia las claves por defecto en producción con las variables de entorno `ADMIN_USER`, `ADMIN_PASS`, `TECH_PASS` y define `AUTH_SECRET` (clave para firmar los tokens).

## Orden de trabajo, firmas digitales y envío por correo

- Al **completar** una visita, el técnico firma la orden **con el dedo** (cliente y técnico)
  directamente en el celular, adjunta evidencia y confirma el correo del cliente.
- La orden replica el formato oficial de WIFIRED (copia cliente/técnico) y se puede imprimir.
- Al completar, el sistema **envía la orden firmada al correo del cliente** automáticamente.
  La coordinación también puede reenviarla desde la orden ("Enviar al cliente").

### Configurar el envío de correo

> **Importante:** Railway bloquea SMTP (puertos 587 y 465), por eso el envío usa **APIs HTTP**
> (puerto 443, no bloqueado). Recomendado: **Brevo** (gratis 300 correos/día y permite usar tu
> Gmail como remitente sin verificar dominio).

**Opción A — Brevo (recomendada):**
1. Crea una cuenta gratis en brevo.com.
2. **Senders & IP → Senders →** agrega y verifica tu correo remitente (puede ser tu Gmail;
   te llega un enlace de confirmación).
3. **SMTP & API → API Keys →** crea una API key.
4. En Railway → servicio web → **Variables**:

| Variable | Valor |
|----------|-------|
| `BREVO_API_KEY` | La API key de Brevo. |
| `MAIL_FROM` | El correo remitente verificado (ej. tu Gmail o `soporte@wifired.cl`). |

**Opción B — Resend:** define `RESEND_API_KEY` y `MAIL_FROM` (requiere verificar un dominio propio).

> Sin ninguna de estas variables, todo funciona igual pero **no se envía el correo** (se avisa en
> pantalla y la orden queda firmada y guardada para imprimir/reenviar).
