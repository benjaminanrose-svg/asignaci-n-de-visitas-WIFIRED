# Seguridad

Probado en servidor local (2026-10): todas las pruebas OK.

## Acceso y cuentas
- **Cuentas separadas**: cada coordinador y cada técnico con su usuario (Configuración →
  Empresa → Cuentas de coordinación; Técnicos). Coordinador ve lo de siempre, técnico solo lo suyo.
- **Contraseñas**: scrypt + salt, nunca en texto legible (`pass_plain` vaciado). Nadie puede verlas,
  solo **restablecer** → clave temporal que se muestra una sola vez.
- **Cambio obligatorio** de clave en el primer ingreso / con clave temporal o de fábrica
  (`debe_cambiar` → la API responde 403 hasta cambiarla).
- **Política de clave**: ≥8 caracteres, letras y números, sin el usuario, no la de fábrica.
- **Cerrar sesiones** a distancia (`token_ver`): al cambiar/restablecer clave o desactivar cuenta,
  los tokens viejos dejan de servir (401).
- **Desactivar cuentas** (`activo`); técnico borrado o inactivo ya no entra. No se puede desactivar
  a uno mismo ni al último coordinador activo.

## Protección del servidor
- **Archivos bloqueados**: solo se sirven `/`, `index.html`, `manifest`, `sw.js`, `css/`, `js/`,
  `icons/`. `data/seed.json`, código, vault y `.env` → 404.
- **Sesión**: tokens firmados HMAC-SHA256 (7 días) con `AUTH_SECRET` (definir 32+ caracteres en Coolify).
- **Anti fuerza bruta**: bloqueo por IP y **por usuario** tras varios intentos (429) + rate limiter global.
- **Tamaño de envíos**: 64 KB sin sesión (413), grande solo con sesión.
- **Clave del bot**: comparación en tiempo constante (`timingSafeEqual`).
- **Bot e ISP solo desde red local** (2026-10-30): `/api/bot/*` y `/api/isp/*` responden 404 si `req.ip`
  no es privada (127/10/172.16-31/192.168), aunque se tenga la clave.
- **Cuerpo grande (100 MB)** solo con token de firma válida o `x-bot-key` correcta (antes bastaba un header falso).
- **PIN**: 5 intentos fallidos → el código se anula (`pinFallos` en server.js).
- **Links en href**: `mapsHref` (util.js) codifica comillas/espacios de links pegados (antes se podía inyectar atributos; CSP lo frenaba).
- **Revisión 2026-10-30 antes de publicar**: 3 técnicos con clave de fábrica (benjamin.rojas, cristian, benito) → restablecer.
- **Sistema ISP**: clave propia `ISP_API_KEY` (header `x-isp-key`). El calendario solo se deja
  incrustar en `ISP_ORIGIN`; el pase dura 8 h y actúa como la cuenta coordinadora `ISP_USUARIO`.
- **Cabeceras / CSP** contra inyecciones; listas blancas de campos; registro `[LOGIN] ok/fallido`.
- **Sin IP pública**: solo por VPN (ver [[Despliegue]]).

## Regla dura
🔴 **NUNCA** subir claves al repo (BOT_API_KEY, AUTH_SECRET, contraseñas). Van solo en variables
de entorno del servidor (Coolify/SSH). Ver [[Reglas]].
