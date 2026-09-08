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
