# Guía de despliegue en servidor propio — WIFIRED Agenda de Visitas

> Documento técnico para el **técnico en telecomunicaciones** que montará el entorno.
> Objetivo: migrar la app desde Railway a un **servidor de la oficina**, manteniendo el flujo
> actual: **`git push` a GitHub → el servidor redesplega solo**, con HTTPS y notificaciones push.

---

## 1. Qué es la aplicación (stack)

- **Backend**: Node.js (Express) — `server.js`. Sirve la SPA y expone `/api/*`.
- **Base de datos**: PostgreSQL (a través de `pg`).
- **Frontend**: SPA (HTML/CSS/JS sin framework) + PWA (service worker + Web Push).
- **Correo**: API HTTP (Brevo o Resend) o SMTP (Gmail). Railway bloquea SMTP; en servidor
  propio SMTP también sirve, pero se recomienda mantener Brevo por simplicidad.
- **PDF**: `pdfkit` (órdenes de trabajo).
- **Contenedor**: ya viene `Dockerfile` (base `node:20-alpine`). No hay que cambiarlo.
- **Node requerido**: 18+ (la imagen usa 20).

**Importante — modos de la base de datos:**
- **Con** `DATABASE_URL` definido → modo PostgreSQL (persistente, compartido). **Este es el modo de producción.**
- **Sin** `DATABASE_URL` → modo memoria (se pierde todo al reiniciar). Solo para pruebas.

> ⚠️ Las claves **VAPID** de notificaciones push se **generan solas y se guardan en la base de datos**.
> Por eso **es obligatorio tener PostgreSQL** (`DATABASE_URL`): si no, las notificaciones se
> re-generan en cada reinicio y los técnicos pierden la suscripción.

---

## 2. Requisitos del servidor

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 núcleos | 2–4 núcleos |
| RAM | 2 GB | **4 GB** (el panel de Coolify ya usa ~1 GB) |
| Disco | 30 GB | 40–80 GB (respaldos + evidencias) |
| SO | Debian 12 (Bookworm) o Ubuntu Server 22.04/24.04 LTS | **Debian 12** |
| Red | IP pública (la oficina ya la tiene) | IP pública **fija** ideal |
| Energía | — | UPS / que quede prendido 24/7 |

---

## 3. Preparar el sistema operativo (Debian 12)

```bash
# como root
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban

# Zona horaria (Chile continental)
timedatectl set-timezone America/Santiago

# Firewall: solo SSH + HTTP + HTTPS (el resto cerrado)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# (Recomendado) SSH con llave en vez de contraseña, y deshabilitar login root por password.
```

> **PostgreSQL nunca se expone a internet.** No abrir el puerto 5432 en el firewall ni en el router.

---

## 4. Instalar Coolify (panel de auto-deploy)

Coolify instala Docker por sí solo. Es autohospedado y **gratuito**.

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Al terminar, abrir en el navegador: **`http://IP-DEL-SERVIDOR:8000`** y crear la cuenta admin
(la primera cuenta es la dueña del panel).

> Alternativa equivalente: **Dokploy** (`curl -sSL https://dokploy.com/install.sh | sh`, panel en `:3000`).
> Esta guía usa Coolify por tener más comunidad; los conceptos son los mismos.

---

## 5. Crear PostgreSQL en Coolify

1. En el panel: crear un **Proyecto** (ej. `wifired`).
2. Dentro del proyecto: **+ New → Database → PostgreSQL**.
3. Coolify entrega la cadena de conexión interna. **Copiarla** — es la `DATABASE_URL`.
   Tendrá forma: `postgres://usuario:clave@host:5432/basededatos`.
4. Dejar la base **solo accesible internamente** (no exponer puerto público).

> Al primer arranque, la app crea las tablas (`tecnicos`, `visitas`, `settings`) y siembra los
> datos iniciales una sola vez. No hay que correr migraciones a mano.

---

## 6. Variables de entorno (exactas de esta app)

En Coolify → servicio de la app → pestaña **Environment Variables**. Estas son las reales que lee el código:

| Variable | ¿Obligatoria? | Valor / ejemplo | Notas |
|---|---|---|---|
| `DATABASE_URL` | **Sí** | (la que dio Coolify en el paso 5) | Sin esto = modo memoria (no persiste). |
| `AUTH_SECRET` | **Sí** | cadena larga y aleatoria | Firma los tokens de sesión. Ver comando abajo. |
| `PORT` | No | `8080` | Coolify/Docker lo maneja; dejar 8080. |
| `ADMIN_USER` | Recomendada | `coordinacion` | Usuario de coordinación. |
| `ADMIN_PASS` | **Cambiar** | (clave fuerte propia) | Por defecto `wifired2026` — **cambiarla**. |
| `TECH_PASS` | **Cambiar** | (clave fuerte propia) | Clave inicial de los técnicos (por defecto `wifired`). |
| `MAIL_FROM` | Sí (correo) | `soporte@wifired.cl` | Remitente verificado en Brevo. |
| `BREVO_API_KEY` | Sí (correo) | (API key de Brevo) | Recomendado. Ver sección 11. |
| `RESEND_API_KEY` | Alternativa | (API key de Resend) | Usar en vez de Brevo si se prefiere. |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Alternativa | correo + clave de app | Solo si se opta por SMTP en vez de API. |

Generar un `AUTH_SECRET` seguro:
```bash
openssl rand -base64 48
```

> **No** definir `RESET_TECNICOS` en producción (es una utilidad puntual de re-siembra).

---

## 7. Conectar GitHub y activar el auto-deploy

1. En Coolify: **Sources → + Add → GitHub App** y autorizar la cuenta/organización dueña del repo.
2. En el proyecto: **+ New → Application → Public/Private Repository** y elegir el repo
   `asignaci-n-de-visitas-wifired`.
3. **Branch**: la rama que se despliega (la misma que hoy sigue Railway, p. ej. `main`).
4. **Build Pack**: seleccionar **Dockerfile** (el repo ya lo trae; Coolify lo detecta).
5. Puerto expuesto: **8080**.
6. Activar **"Deploy on push"** (webhook automático).

A partir de aquí: **cada `git push` a esa rama dispara un redeploy automático.** ✅ (Mismo flujo que Railway.)

---

## 8. Dominio, DNS y HTTPS

Las **notificaciones push y la PWA exigen HTTPS**, y HTTPS exige un dominio (no sirve la IP pelada).

1. Elegir un subdominio, ej. **`agenda.wifired.cl`**.
2. En el DNS del dominio: crear un registro **`A`** → apuntando a la **IP pública** de la oficina.
   - Si la IP es **dinámica**: usar **DDNS** (DuckDNS o el actualizador de Cloudflare) para que el
     registro se actualice solo cuando cambie la IP.
3. En Coolify → app → **Domains**: escribir `https://agenda.wifired.cl`. Coolify emite el
   certificado **Let's Encrypt automáticamente** (requiere que los puertos 80/443 lleguen al servidor).

---

## 9. Router de la oficina (port forwarding)

Como el servidor está detrás del router de la oficina:

1. Asignar al servidor una **IP local fija** (reserva por MAC en el router).
2. **Redirigir puertos** al servidor:
   - `80` (TCP) → servidor (necesario para que Let's Encrypt valide).
   - `443` (TCP) → servidor (tráfico HTTPS real).
3. **No** redirigir ningún otro puerto (ni 5432, ni 8000 del panel).

> Acceso al panel de Coolify (`:8000`): dejarlo **solo por red interna** o vía **túnel SSH**, nunca
> abierto a internet.

**Alternativa sin abrir puertos:** si se prefiere no exponer la IP, **Cloudflare Tunnel** (gratis)
publica la app con HTTPS sin port forwarding y ocultando la IP. Es igual de válido; es una decisión
del técnico según la política de red.

---

## 10. Correo (Brevo — recomendado)

1. Cuenta gratis en brevo.com (300 correos/día).
2. **Senders & IP → Senders**: agregar y **verificar** el remitente (puede ser un Gmail o
   `soporte@wifired.cl`).
3. **SMTP & API → API Keys**: crear una API key.
4. Poner en Coolify: `BREVO_API_KEY` = la key, y `MAIL_FROM` = el remitente verificado.

Sin estas variables, la app funciona igual pero **no envía correos** (órdenes ni evidencia); avisa en pantalla.

---

## 11. Respaldo automático de PostgreSQL

En servidor propio, los respaldos son responsabilidad de la oficina. Dejar un respaldo diario:

```bash
# /root/backup-wifired.sh
#!/usr/bin/env bash
set -e
FECHA=$(date +%F_%H%M)
DEST=/root/backups
mkdir -p "$DEST"
# Ajustar el nombre del contenedor de Postgres (docker ps) y las credenciales:
docker exec <contenedor_postgres> pg_dump -U <usuario> <basededatos> | gzip > "$DEST/wifired_$FECHA.sql.gz"
# Conservar solo los últimos 14 días
find "$DEST" -name 'wifired_*.sql.gz' -mtime +14 -delete
```

```bash
chmod +x /root/backup-wifired.sh
# Programar todos los días a las 03:00
( crontab -l 2>/dev/null; echo "0 3 * * * /root/backup-wifired.sh" ) | crontab -
```

> Coolify también ofrece **backups programados de bases de datos** desde su panel (incluso a S3);
> se puede usar eso en vez del cron. Idealmente, copiar los respaldos a otra máquina/nube.

---

## 12. Checklist de verificación post-despliegue

- [ ] La URL `https://agenda.wifired.cl` abre con **candado válido** (HTTPS OK).
- [ ] Login de **coordinación** funciona (con la clave nueva de `ADMIN_PASS`).
- [ ] Login de un **técnico** funciona.
- [ ] Crear/editar una visita y **recargar**: los cambios **persisten** (confirma PostgreSQL activo).
- [ ] Instalar la PWA en un celular ("Agregar a pantalla de inicio").
- [ ] El técnico **activa notificaciones** y recibe un push al asignarle una visita.
- [ ] Completar una visita **envía la orden por correo** al cliente.
- [ ] Desde el detalle de una visita se puede **descargar el ZIP** con toda la evidencia y la orden en PDF.
- [ ] Un `git push` a la rama configurada dispara un **redeploy automático**.
- [ ] El **respaldo diario** genera un archivo en `/root/backups`.

---

## 13. Mantenimiento

- **Actualizaciones de la app**: seguir igual que hoy → `git push`. Coolify redesplega.
- **Actualizaciones del SO**: `apt update && apt upgrade` periódico + reinicios controlados.
- **Monitoreo**: revisar en Coolify los logs y el uso de CPU/RAM/disco.
- **Energía/Internet**: si se corta la luz o el internet de la oficina, el servicio se cae hasta
  que vuelva (no hay redundancia como en Railway). Considerar UPS y, si es crítico, un enlace de
  respaldo.

---

## Resumen del montaje final

```
Internet
  │  agenda.wifired.cl (registro A → IP pública oficina; DDNS si es dinámica)
  ▼
Router oficina  → forward 80/443 → Servidor Debian 12
  ├─ Coolify           → deploy automático desde GitHub + HTTPS (Let's Encrypt)
  ├─ PostgreSQL        → base de datos (solo interna) + respaldo diario
  └─ App (Docker)      → Express + SPA/PWA, puerto 8080
```

Flujo de trabajo mantenido: **editar → `git push` → redeploy automático.** ✅
