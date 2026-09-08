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
