# Base de datos

Toda la lógica de datos está en **`db.js`**. Usa **PostgreSQL**; si no hay DB,
guarda en **memoria** (mismo comportamiento).

## Tablas principales
- **visitas** — visitas técnicas (tiene campo `orden` para reordenar).
- **clientes**, **tecnicos** (usuarios con rol).
- **tickets** — soporte/retiro/pago, con adjuntos.
- **servicios / bot_contactos** — contactos del bot, opt-in de anuncios (`anuncios`).
- **bot_media** — imágenes de comunicados (guardadas una vez).
- **inventario** — equipos de [[Bodega]] (estado + historial).

## Seguridad de datos
Los campos se filtran con listas blancas (VISIT_FIELDS, TICKET_FIELDS,
INV_FIELDS, etc.) → ver [[Seguridad]].

Relacionado: [[Arquitectura]] · [[Bodega]]
