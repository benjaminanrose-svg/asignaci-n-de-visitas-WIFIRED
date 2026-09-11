# Bot de WhatsApp

Carpeta `bot/` (`whatsapp-bot.js`). Usa **Baileys** (WhatsApp gratis, sin API
oficial). Corre con **PM2** (proceso `wifired-bot`). Sesión en `auth_wifired`.

## Menú fijo
1. Soporte técnico
2. Planes y contratación  ⚠️ NO renombrar "Contratación" (dispara factibilidad)
3. Cancelar servicio / Retiro
4. Pago (guarda la foto del comprobante; pide datos del titular y N° de
   transferencia/orden visible)

## Comunicados (broadcasts)
- Se envían con throttle **anti-bloqueo** (por lotes, con pausas).
- Aceptan **imagen** (se guarda 1 vez en `bot_media`).
- Al final preguntan si quiere seguir recibiendo anuncios → se guarda **opt-in**
  (`anuncios` sí/no). Los generales solo van a quienes dijeron sí.
- Comandos: BAJA/STOP/ALTA.

## Nodos
Puede responder **solo a números de un nodo** (zona) si se configura.

## Conexión con la web
Patrón **outbox**: la web deja mensajes → el bot los envía cada ~8s.

Relacionado: [[Despliegue]] · [[Seguridad]]

## Confirmación de visitas (SÍ / NO)
Se activa en **Configuración → Bot → Confirmación automática de visitas**.
Ese interruptor es el **interruptor maestro** (`bot.confirma_visita.activo`):

- **Encendido**: a la hora configurada se encola un WhatsApp para las visitas de
  **mañana** (`correrConfirmaciones` en `server.js`). En el detalle de una visita
  aparece el botón manual *"Pedir confirmación ahora"*.
- **Apagado** (3 barreras):
  1. El envío automático no corre.
  2. El botón manual se oculta y el servidor lo rechaza.
  3. `GET /bot/outbox` **no entrega** mensajes tipo `confirmacion`, y al guardar la
     config apagada se **cancelan** los que quedaron en cola (quedan marcados
     `cancelado`, no se borran).

> Antes (hasta 2026-09-11) el botón manual y la cola NO respetaban el interruptor:
> una confirmación encolada antes de apagarlo salía igual después (por ej. al
> reiniciarse el servidor/bot tras un despliegue).

Para revisar qué pasó: en los logs del servidor buscar `[CONFIRMACION]`
(`solicitudes encoladas` = automático · `solicitud manual encolada` = botón).
