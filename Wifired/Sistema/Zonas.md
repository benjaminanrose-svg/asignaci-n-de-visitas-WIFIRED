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
El número de orden se arma con la **zona del nodo elegido** (servidor: `db.js` →
`nextOt` / `siglaZona`):

- Nodo de **Paine** → `OT-PAIN-2026-NNN`
- Nodo de **Melipilla** → `OT-MEL-2026-NNN`
- Sin nodo o desconocido → **MEL** por defecto.
- **Factibilidad** mantiene su serie `OT-FAC-...`.

Usa la zona configurada en Configuración → Red y Nodos; si el nodo no la tiene,
cae al mapeo por nombre.

### Correlativo por zona (y cómo reiniciarlo)
Cada sigla lleva **su propia numeración** (MEL, PAIN y FAC por separado).
En **Configuración → Red y Nodos** hay dos campos: *Próximo N° de OT* para
Melipilla y para Paine.
- **0** = automático (sigue el correlativo solo). Es lo normal.
- Un número = desde ahí parte. Si ese número ya está usado, salta al primero
  libre → **nunca se repite una OT**.

### Al reagendar, la OT se renueva
Coordinación reagenda → la visita recibe el **siguiente número de su zona**
(el frontend manda `renovar_ot`). La **OT anterior queda registrada en el
historial** de la visita, así no se pierde el rastro.
