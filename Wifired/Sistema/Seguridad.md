# Seguridad

- **Contraseñas**: scrypt + salt + comparación segura (`server-auth.js`).
- **Sesión**: tokens firmados HMAC-SHA256, 7 días.
- **Anti fuerza bruta** en login + **rate limiter** global (300/min por IP).
- **Cabeceras / CSP** para bloquear inyecciones.
- **Roles**: coordinador vs técnico (el técnico no ve credenciales de otros).
- **Datos**: listas blancas de campos (no se guarda cualquier cosa).
- Comprobantes/adjuntos se abren **dentro de la página** (CSP bloquea abrir
  data: en pestaña nueva).

## Regla dura
🔴 **NUNCA** subir claves al repo (BOT_API_KEY, tokens). Van solo en variables
de entorno del servidor (Coolify/SSH). Ver [[Reglas]].
