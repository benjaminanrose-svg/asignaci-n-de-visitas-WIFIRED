# Despliegue

## App / server
Fusionar la rama de trabajo a **`main`** → **Coolify** publica solo.

## Bot
En el servidor (`/opt/wifired/bot`):
```
git pull
pm2 restart wifired-bot
```
Sesión del bot: carpeta `auth_wifired`.

## PWA
Al cambiar CSS/JS de la app, **subir la versión** de caché en `sw.js`
(`wifired-vNN`) o los cambios no llegan a los usuarios.

Ver [[Reglas]] · [[Arquitectura]]

## IP pública (actualizado 2026-11-02)
- IP pública: **45.169.163.102**. El MikroTik ya redirige el **8081** → agenda (`http://45.169.163.102:8081`, sin candado).
- Plan: abrir 80/443 → Traefik de Coolify + certificado Let's Encrypt para la IP; luego cerrar el 8081.
- La sección de abajo quedó en parte obsoleta.
- **HTTPS por IP (2026-11-02, HECHO):** `https://45.169.163.102` → agenda, certificado Let's Encrypt para IP
  (perfil `shortlived`, ~6 días, Traefik lo renueva solo). La IP pública está EN el servidor (VM VMware,
  interfaz `ens37`), no en el MikroTik (el MikroTik es 192.168.11.225, sin acceso de administración).
  - Proxy `/data/coolify/proxy/docker-compose.yml`: 443 ligado solo a 45.169.163.102 y 192.168.11.234
    (Tailscale usa 443 en su IP: `tailscale serve` → https://wifired.tail1c19ed.ts.net), 8080 solo 127.0.0.1,
    resolver `letsencrypt-ip` (profile shortlived, certificatesduration=160, disablecommonname). Respaldos `.bak`/`.bak2`.
    Copia también en BD de Coolify (`servers.proxy.last_saved_proxy_configuration`). NO usar "Reset" del proxy.
  - `dynamic/agenda-ip.yaml`: router Host(`45.169.163.102`) → `http://192.168.11.234:8081` + certificado por defecto
    (sin SNI el navegador no dice la IP). ufw: `allow from 10.0.0.0/8 to 8081` (Traefik → agenda).
  - Panel Coolify 8000 y 6001/6002 bloqueados desde internet (DOCKER-USER en `/etc/ufw/after.rules`, marca WIFIRED-PANEL).
  - Pendiente: SSH 22 abierto a internet; puerto 8081 público sin HTTPS.
- **Dominio (2026-11-02, HECHO):** `https://wengan.wifired.cl` (subdominio creado por el jefe en cPanel, A → 45.169.163.102).
  Routers `agenda-dom-https/http` en `dynamic/agenda-ip.yaml`, resolver normal `letsencrypt` (90 días, se renueva solo).
  El certificado Sectigo pagado del jefe NO hace falta.

## 🔴 Restricción de red: NO hay IP pública
El servidor **solo es accesible por VPN** (técnicos y coordinación entran así).
- Los **clientes NO pueden abrir links** hacia nuestro servidor → nada de páginas
  públicas, formularios o links "para el cliente".
- Lo que sí funciona hacia el cliente: **WhatsApp** (el bot sale hacia internet)
  y servicios públicos (Google Maps).
