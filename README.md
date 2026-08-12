# WIFIRED · Agenda de Visitas Técnicas

Sistema web para la **asignación y control de visitas técnicas** de WIFIRED (Melipilla).
Reemplaza y mejora la planilla Excel `Agenda_Visitas_Melipilla_Wifired.xlsx`, con foco en que la
asignación de visitas sea **rápida, visual y fácil de entender**.

> Esta es una **propuesta de diseño para presentar en localhost**. No requiere instalación de
> dependencias ni conexión a bases de datos: los datos se guardan en el navegador (localStorage)
> y vienen sembrados con las 118 órdenes de trabajo reales del Excel.

---

## Cómo ejecutarlo (localhost)

No necesita compilación. Solo un servidor estático. Dentro de la carpeta del proyecto:

```bash
# Opción 1 — Python (viene en casi todos los equipos)
python3 -m http.server 8000

# Opción 2 — Node
npx serve .
```

Luego abrir en el navegador: **http://localhost:8000**

> Debe abrirse mediante un servidor (`http://…`), no con doble clic al archivo (`file://`),
> porque la app usa módulos JavaScript.

---

## Qué incluye

| Vista | Para qué sirve |
|-------|----------------|
| **Panel** | Indicadores clave (total, pendientes, programadas, completadas, reprogramadas), carga de trabajo por técnico, distribución por estado y próximas visitas. |
| **Agenda / Asignación** | Tablero visual por día. Se **arrastra** una visita desde "Por asignar" hacia el técnico, o se reorganiza por bloque horario. Navegación por fecha. |
| **Visitas** | Registro completo con búsqueda y filtros por estado, técnico, bloque y tipo. |
| **Técnicos** | Carga y desempeño de cada técnico. |
| **Orden de trabajo** | Ficha imprimible (copia cliente / técnico) desde cualquier visita, con el formato de WIFIRED. |

### Mejoras respecto al Excel
- Asignación por **arrastrar y soltar** en lugar de copiar/pegar celdas.
- **Estados con color** para leer de un vistazo (pendiente, programada, completada, reprogramada, cancelada).
- **Búsqueda instantánea** por cliente, OT, dirección o teléfono.
- **Indicadores automáticos** que antes se calculaban a mano.
- Orden de trabajo lista para **imprimir** sin salir del sistema.

---

## Estructura

```
index.html            Estructura y layout base
css/                  base (tokens/tipografía) · layout · componentes
js/
  app.js              Router + arranque
  store.js            Estado y persistencia (localStorage)
  util.js             Helpers (fechas, colores, formato)
  components.js       Badges, avatares, modales, orden de trabajo
  form.js             Formulario de crear/editar/asignar visita
  views/              panel · agenda · visitas · tecnicos
data/seed.js          118 OT reales extraídas del Excel
```

## Datos y reinicio
Los cambios (asignaciones, nuevas visitas, ediciones) se guardan en el navegador.
Para volver a los datos originales del Excel, ejecutar en la consola del navegador:

```js
localStorage.removeItem('wifired_agenda_v1'); location.reload();
```

---

*Propuesta de diseño — WIFIRED Ltda., Melipilla.*
