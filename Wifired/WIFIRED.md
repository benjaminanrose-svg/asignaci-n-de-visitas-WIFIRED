# 🧠 WIFIRED — Cerebro del proyecto

> Nota central (MOC). Empieza aquí. Cada Claude debe leer esto y las notas
> enlazadas para tener contexto SIN escanear todo el código (ahorra tokens).

## Qué es
Sistema web para gestionar **visitas técnicas** de WIFIRED (ISP de internet,
Melipilla, Chile) + un **bot de WhatsApp** para clientes.

## Mapa del sistema
- [[Arquitectura]] — cómo está armado (SPA + Express + PostgreSQL, PWA)
- [[Base de datos]] — dónde vive cada dato (db.js)
- [[Vistas]] — las pantallas de la app
- [[Bodega]] — inventario de equipos por código de serie
- [[Zonas]] — Melipilla / Paine (colores y filtros)
- [[Bot WhatsApp]] — el bot (Baileys, menú, comunicados)
- [[Seguridad]] — cómo se protege
- [[Despliegue]] — cómo se publica (Coolify / PM2)

## Cómo trabajamos
- [[Reglas]] — reglas irrompibles (idioma, tokens, ramas, seguridad)
- [[Dos Claude en paralelo]] — mi flujo con Claude local + Claude nube
- [[Pendientes]] — lo que falta / ideas
- [[Bitacora]] — registro de cambios importantes

## Quién es el usuario
Benjamín, **administrador y post-venta** (NO programador). Explicar simple,
en español. Ahorrar tokens siempre.

## Referencia técnica (detalle fino)
Usar solo si las notas de arriba no alcanzan:
- [[MEMORIA_ARQUITECTURA]] — tabla Módulo | Ruta | Archivo | Propósito (todas las rutas API).
- [[Mapa del proyecto]] — qué hay dentro de cada archivo (funciones y líneas).
- [[Proyecto - Resumen]] — resumen largo del sistema.
- [[Posibles mejoras]] — ideas detalladas (las activas van en [[Pendientes]]).

## 🔴 Protección de datos (regla dura)
- **Nunca** escribir contraseñas, API keys ni tokens en estas notas: el vault
  vive dentro del repo. Las claves van **solo** en variables de entorno.
- Si una nota necesita nombrar una credencial, poner **el nombre de la variable**
  (ej. `BOT_API_KEY`), nunca su valor.
- Ver [[Seguridad]] · [[Reglas]]
