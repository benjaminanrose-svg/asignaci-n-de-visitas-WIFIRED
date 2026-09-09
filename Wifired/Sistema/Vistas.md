# Vistas (pantallas)

En `js/views/`. Roles: **coordinador** (ve todo) y **técnico** (ve lo suyo).

- **Panel** — resumen.
- **Agenda / Asignación** — asignar visitas a técnicos; se pueden **arrastrar**
  para reordenar (incluso dentro del mismo técnico).
- **Calendario** — mensual con colores por [[Zonas]] (barra + `📍 MEL/PAI`) y
  filtro por zona. Al tocar un día abre un **tablero por técnico** (mismas
  tarjetas de Asignación) con **reasignación rápida** desde un selector.
  La columna "Por asignar" solo aparece si hay visitas sin técnico. El modal
  tiene botones **‹ ›** y **Hoy** para cambiar de día sin cerrarlo.
  Al abrir una visita desde ahí, el detalle trae **← Volver a la lista**
  (no te devuelve hasta el calendario).
- **Historial** — todas las visitas con búsqueda y filtros.
- **Clientes** — **tabla**: Cliente (nombre+RUT) · Dirección · Servicio/Plan ·
  Equipos · Estado · Ver ficha. Filtro por **nodo**. La ficha muestra sus
  visitas, su servicio y sus **📦 equipos instalados** (con opción de retirar).
- **Tickets** — soporte/retiro/pago; guía paso a paso por categoría; ver adjuntos.
- **Servicios** — comunicados (broadcasts) con imagen + opt-in de anuncios.
- **[[Bodega]]** — inventario de equipos (solo coordinación).
- **Técnicos** · **Ubicación**.
- **Configuración** — en **4 pestañas**: Empresa y General · Red y Nodos
  (incluye la **zona** de cada nodo) · Agendamiento · Sistema e Integraciones.

## Nueva visita (formulario)
Al escribir el nombre del cliente **autocompleta** desde los clientes existentes
(rellena RUT, teléfono, correo y dirección) y muestra un badge
🟢 *Cliente registrado* / 🔵 *Nuevo cliente*.

Relacionado: [[Arquitectura]] · [[Bot WhatsApp]] · [[Zonas]]
