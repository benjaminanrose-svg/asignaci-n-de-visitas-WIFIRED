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

También se incluye un servidor Node sin dependencias (el mismo que se usa en producción):

```bash
npm start          # sirve en http://localhost:8080 (o el puerto de la variable PORT)
```

> Debe abrirse mediante un servidor (`http://…`), no con doble clic al archivo (`file://`),
> porque la app usa módulos JavaScript.

---

## Despliegue en Railway

El proyecto ya viene listo para Railway (u otro hosting tipo Render/Fly). Usa un servidor
estático en Node **sin dependencias** (`server.js`) que escucha en el puerto que asigna la
plataforma (`process.env.PORT`).

**Pasos:**
1. En Railway: **New Project → Deploy from GitHub repo** y elegir este repositorio
   (rama `claude/visit-assignment-web-system-jm2u9e` o la que se haya fusionado).
2. Railway detecta `package.json` automáticamente (Nixpacks), instala y ejecuta `npm start`.
3. En **Settings → Networking → Generate Domain** para obtener la URL pública.

No hay que configurar variables de entorno: Railway inyecta `PORT` y el servidor lo toma solo.

Archivos relevantes para el despliegue:

| Archivo | Rol |
|---------|-----|
| `server.js` | Servidor estático Node (cero dependencias, respeta `PORT`, MIME correctos, guard anti path-traversal). |
| `package.json` | Script `start` y versión de Node (`>=18`). |
| `railway.json` | Builder Nixpacks + comando de inicio y política de reinicio. |

> Nota: los datos se guardan en el navegador de cada usuario (localStorage). No hay base de
> datos compartida todavía; es una demo de diseño. El siguiente paso para producción real
> sería agregar un backend con persistencia.

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
