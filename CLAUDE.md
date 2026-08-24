# WIFIRED — Reglas para Claude

## REGLA IRROMPIBLE: ahorro máximo de tokens (MÁXIMA PRIORIDAD)
Hacer las cosas bien pero lo más eficiente posible. Nada de vueltas, re-lecturas
innecesarias, ni explicaciones largas. Respuestas cortas y al grano.
Ahorrar tokens SIEMPRE al máximo: menos texto, menos tool-calls, editar en vez de
reescribir archivos enteros, no repetir contexto. Regla permanente e inquebrantable.

## Idioma y trato
- SIEMPRE responder en español.
- Usuario NO técnico. Explicar simple, paso a paso, tono cercano.
- Se permite hablar aún más directo/breve ("cavernícola") para ahorrar tokens.

## Rama de trabajo
- Desarrollar SOLO en `claude/visit-assignment-web-system-jm2u9e`.

## Despliegue
- Bot (`/opt/wifired/bot`): `git pull` + `pm2 restart wifired-bot` en el servidor.
- App/server.js: fusionar a `main` → Coolify despliega solo.
- Carpeta de sesión del bot: `auth_wifired`.

## Seguridad
- Nunca commitear claves (ej. BOT_API_KEY) — van solo en env de Coolify/SSH.
- Nunca poner identificador de modelo en commits/PR/código.
