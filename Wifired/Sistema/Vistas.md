# Vistas (pantallas)

En `js/views/`. Roles: **coordinador** (ve todo) y **técnico** (ve lo suyo).

- **Panel** — resumen + **Rendimiento por técnico** detallado (asignadas, completadas, activas,
  canceladas, cierres por día, días trabajados, % cerradas el día
  agendado, demora promedio, último cierre, zonas, tipos y nodos; botón "Ver sus visitas").
  La demora usa el evento `completada` del historial.
  ⚠ El panel **excluye** las activas con fecha de ayer o antes (van a Configuración → Seguimiento),
  **salvo el % de cada técnico**, que sí las cuenta (bajan su %; no figuran como activas).
- **Calendario** — mensual con colores por [[Zonas]] (barra + `📍 MEL/PAI`) y
  filtro por zona. **Cada día es un botón**: tocar cualquier parte (incluida una
  píldora) abre la **lista de asignaciones del día**, nunca una visita suelta.
  Ese modal es un **tablero por técnico** (mismas
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
- **Portal técnico** (celular) — diseño compacto: N° de OT y zona, barra Mapa / Llamar / WhatsApp, coordenadas GPS se muestran como "Ubicación GPS", "Completar visita" destacado y aviso de cambios sin confirmar con botón Reintentar.
- **Configuración** — en **4 pestañas**: Empresa y General · Red y Nodos
  (incluye la **zona** de cada nodo) · Agendamiento · Sistema e Integraciones ·
  **⏰ Seguimiento** = visitas activas vencidas (fecha pasada: desde ayer / ≥7 / 15 / 30 días y aún
  Pendiente/Programada/Reprogramada), agrupadas por técnico; contador rojo en la pestaña. Botones **✓ Completada** (técnico sí la hizo)
  y **✕ Cancelada** (no la hizo) con nota opcional → queda en el historial "verificada por coordinación".
  Cuentas de coordinación en Empresa y General.

## Nueva visita (formulario)
Al escribir el nombre del cliente **autocompleta** desde los clientes existentes
(rellena RUT, teléfono, correo y dirección) y muestra un badge
🟢 *Cliente registrado* / 🔵 *Nuevo cliente*.

Relacionado: [[Arquitectura]] · [[Bot WhatsApp]] · [[Zonas]]

## 📍 Ubicación GPS del cliente (sin IP pública)
- **Técnico**: en su tarjeta, "📍 Estoy en el domicilio — guardar ubicación" (GPS del celular).
- **Coordinación**: en Nueva/Editar visita, campo "Ubicación GPS": se pega el link de
  Google Maps (incluso `maps.app.goo.gl`, lo resuelve el servidor) o coordenadas.
  Botón "Pedir ubicación al cliente por WhatsApp" abre el WhatsApp propio.
- Se guarda en `visita.gps` ("lat, lng"); el botón Mapa del técnico lo usa primero.
  Al autocompletar un cliente se trae su GPS de visitas anteriores.
