# Posibles mejoras — WIFIRED

> Ideas para revisar. Marca: `[ ]` pendiente · `[x]` hecho · `[~]` en progreso.
> Añade notas debajo de cada una.

## ✅ Ya hechas (revisado en el código)
- [x] **Vista de mapa de técnicos** → existe `views/ubicaciones.js`.
- [x] **Botones llamar cliente / abrir en Maps / WhatsApp** → `util.js` (`telLink`,
      `mapsHref`, `waLink`), usados en técnico, tickets y detalle de visita.
- [x] **Modo offline** → la app es PWA (`sw.js`) y usa datos guardados sin señal.
- [x] **Bodega / inventario por N° de serie** → `views/bodega.js`.
- [x] **Bot de WhatsApp** con tickets, planes y broadcasts.

## Pendientes / por conversar

### Funcionalidad
- [ ] Exportar reportes del Panel a PDF/Excel (para jefatura).
- [ ] Filtro por rango de fechas en Historial de visitas.
- [ ] Recordatorio automático al cliente (WhatsApp/correo) el día antes de la visita.
- [ ] Métrica de tiempo promedio por visita / por técnico en el Panel.

### Seguridad
- [ ] Forzar cambio de contraseña por defecto en el primer ingreso.
- [ ] Registro de auditoría (quién asignó/cambió qué y cuándo).

### Calidad / mantenimiento
- [ ] `server.js` (1130 líneas) y `db.js` (888) muy grandes → partir por áreas.
- [ ] `views/servicios.js` (646) y `tickets.js` (536) también grandes.

---

## Mis notas (Benjamín)
<!-- Escribe aquí lo que se te ocurra. Claude lo lee y actúa. -->

- 
