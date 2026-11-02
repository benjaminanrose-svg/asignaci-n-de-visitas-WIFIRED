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

## 🔴 Restricción de red: NO hay IP pública
El servidor **solo es accesible por VPN** (técnicos y coordinación entran así).
- Los **clientes NO pueden abrir links** hacia nuestro servidor → nada de páginas
  públicas, formularios o links "para el cliente".
- Lo que sí funciona hacia el cliente: **WhatsApp** (el bot sale hacia internet)
  y servicios públicos (Google Maps).
