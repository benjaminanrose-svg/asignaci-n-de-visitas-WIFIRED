# Base de datos

Toda la lógica de datos está en **`db.js`**. Usa **PostgreSQL**; si no hay DB,
guarda en **memoria** (mismo comportamiento, pero se pierde al reiniciar).

## Tablas reales
`visitas` · `tecnicos` · `usuarios` · `tickets` · `servicios` · `inventario`
`bot_contactos` · `bot_media` · `bot_outbox` · `push_subs` · `settings`

- **visitas** — visitas técnicas (campo `orden` para reordenar en la agenda).
- **tecnicos / usuarios** — técnicos y sus credenciales (rol coordinador/técnico).
- **tickets** — soporte/retiro/pago, con adjuntos.
- **servicios** — clientes con internet (plan, PPPoE, IP, nodo). Se usan para
  cortar/activar y para los comunicados.
- **inventario** — equipos de [[Bodega]] (estado + historial).
- **bot_contactos / bot_media / bot_outbox** — contactos y cola del [[Bot WhatsApp]].
- **settings** — configuración editable (incluye la **zona de cada nodo**, ver [[Zonas]]).

> ⚠️ **NO existe una tabla `clientes`.** La vista Clientes se **arma juntando**
> las visitas + los servicios, agrupando por **RUT → teléfono → nombre**.
> Por eso al crear una visita el cliente aparece solo.

## Seguridad de datos
Los campos se filtran con listas blancas (VISIT_FIELDS, TICKET_FIELDS,
INV_FIELDS, etc.) → solo se guarda lo esperado. Ver [[Seguridad]].

Relacionado: [[Arquitectura]] · [[Bodega]] · [[Vistas]]
