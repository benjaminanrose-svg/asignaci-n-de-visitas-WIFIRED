# Zonas / comunas (Melipilla y Paine)

WIFIRED atiende **dos comunas**. Cada una tiene su color para leer la agenda
de un vistazo:

- 📍 **Melipilla** — azul/cian
- 📍 **Paine** — morado

## Cómo sabe el sistema la zona
Orden de prioridad (`zonaDeVisita` en `js/util.js`):
1. La **zona configurada del nodo** (Configuración → Red y Nodos).
2. Si el nodo no tiene zona, un **mapeo de respaldo** por nombre
   (Bollenar, Culipran, Ulloa… → Melipilla · Aculeo, Mirador Paine… → Paine).
3. El **técnico**: Jeremy → Melipilla · Moisés → Paine.

## Dónde se ve
- **Calendario**: barra de color y prefijo `📍 MEL / 📍 PAI` en cada visita,
  filtro por zona, y badge en el detalle del día.
- **Nueva visita**: al elegir técnico se autoselecciona un nodo de su zona
  (se puede cambiar a mano si apoya en otra comuna).

Relacionado: [[Vistas]] · [[Base de datos]]

## Sigla de la OT según el nodo
El número de orden se arma con la **zona del nodo elegido** (se genera en el
servidor, en `db.js` → `nextOt` / `siglaZona`):

- Nodo de **Paine** → `OT-**PAIN**-2026-NNN`
- Nodo de **Melipilla** → `OT-**MEL**-2026-NNN`
- Sin nodo o nodo desconocido → **MEL** por defecto.
- Las visitas de **Factibilidad** mantienen su propia serie `OT-FAC-...`.

Usa la zona configurada en Configuración → Red y Nodos; si el nodo no la tiene,
cae al mapeo por nombre. **El correlativo es único** (MEL y PAIN comparten
numeración) para que nunca se repita un número.

> La OT se fija al **crear** la visita: si después cambias el nodo, la sigla no
> cambia (la OT es su identificador).
