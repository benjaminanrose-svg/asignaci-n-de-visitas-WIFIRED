# Bodega (inventario)

Vista `js/views/bodega.js`. **Solo coordinación.** Sigue cada equipo por su
**código de serie** (ej. `HEXATEK251105394`).

## Estados
- 📦 **bodega** (en bodega)
- 🧑‍🔧 **tecnico** (entregado a un técnico)
- 🏠 **instalado** (en cliente)
- ⛔ **baja**

Cada movimiento queda en el **historial** del equipo.

## Categorías (4 fijas)
**Antenas · Decos · Routers · Mesh (Repetidores)**. No hay otras.

Se clasifican solas por el **prefijo del código** (motor `REGLAS_CODIGO`):
ZTEY/HALO/TL-WA→Mesh · UBNT/LHG/FORCE→Antenas · HEXATEK/MAG/IPTV→Decos ·
ZTEG/HWTC/TP-LINK/RB→Routers. Prefijo desconocido → **Routers**.

> Regla de integridad: `clasificar()` SIEMPRE devuelve una de las 4 → ningún
> equipo queda oculto (suma de secciones = Total).
> La **categoría guardada manda** sobre el código (permite corrección manual).

## Vista
**Acordeón**: una sección por categoría (con su total), cada una con una
**tabla** a todo el ancho: Código/Serie · Estado · Asignado a · Ver/Editar.

## Escáner (drawer lateral)
Dos botones en la cabecera:
- **📥 Ingresar equipos** → sin selector de técnico; entra como *En bodega*.
- **📤 Despachar a técnico** → selector de técnico **obligatorio**; queda
  *Con técnico*. Si el equipo no existe, se crea y se entrega. Si estaba con
  otro técnico, avisa y lo reasigna.

Con la pistola: el `Enter` dispara el registro. Badge verde + beep + contador
de la sesión. Botón **Finalizar entrega**.

## Acciones
entregar → instalar / devolver → baja / reingresar.
Al **instalar** hay un buscador de clientes (nombre/RUT/dirección) que vincula
el equipo al cliente; los equipos salen luego en su ficha ([[Vistas]]).

Datos: tabla `inventario` en [[Base de datos]].
