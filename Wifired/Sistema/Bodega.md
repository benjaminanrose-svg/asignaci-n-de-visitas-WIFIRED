# Bodega (inventario)

Vista `js/views/bodega.js`. **Solo coordinación.** Sigue cada equipo por su
**código de serie** (ej. `HEXATEK251105394`).

## Estados
- 📦 **bodega** (en bodega)
- 🧑‍🔧 **tecnico** (entregado a un técnico)
- 🏠 **instalado** (en cliente)
- ⛔ **baja**

Cada movimiento queda en el **historial** del equipo.

## Categorías
Deco IPTV, Router, Antena, ONU, Cable/Material, Otro.
Vista con **barra lateral de categorías** + panel de productos de la elegida.

## Acciones
entregar → instalar / devolver → baja / reingresar.

Datos: tabla `inventario` en [[Base de datos]].
