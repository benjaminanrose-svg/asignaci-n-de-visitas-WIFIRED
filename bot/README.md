# Bot de WhatsApp · WIFIRED

Bot **gratis** que atiende a los clientes por WhatsApp con un menú y crea
**tickets** automáticamente en la app WIFIRED. Corre en el mismo servidor que
la app y le habla por su API local (no usa internet para eso).

> ⚠️ Usa WhatsApp Web de forma no oficial. Va contra las reglas de WhatsApp y
> el número podría ser bloqueado. Para bajar el riesgo: no enviar mensajes
> masivos, responder solo a quien escribe primero, y de preferencia usar un
> número secundario.

---

## Cómo funciona el flujo

Cuando un cliente escribe, el bot responde con:

```
1️⃣ Soporte técnico        → crea ticket "Soporte"
2️⃣ Planes y contratación  → pide UBICACIÓN → crea ticket "Contratación" (factibilidad)
3️⃣ Pagos y facturación    → crea ticket "Pagos"
4️⃣ Agendar/consultar visita → crea ticket "Visita"
5️⃣ Hablar con un ejecutivo → silencia el bot y crea ticket "Ejecutivo"
```

- Si la **coordinación responde manualmente** desde el WhatsApp, el bot se
  **calla 3 horas** en ese chat para no interrumpir.
- El cliente puede escribir **menú** en cualquier momento para volver al inicio.

---

## Instalación en el servidor (por SSH)

### 1. Requisitos (una sola vez)

Necesitas **Node 18 o superior** y las librerías del navegador para el bot.
Entra por SSH como root y ejecuta:

```bash
# Node 18 (si no lo tienes)
node -v   # si muestra v18 o más, ya está; si no:
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Librerías que necesita el navegador interno (Chromium) en Debian/Ubuntu
apt-get install -y chromium \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libatspi2.0-0 fonts-liberation
```

### 2. Traer el código del bot

```bash
cd /opt
git clone https://github.com/benjaminanrose-svg/asignaci-n-de-visitas-WIFIRED.git wifired
cd wifired/bot
npm install
```

### 3. Configurar la clave del bot

El bot y la app comparten una **clave secreta** (`BOT_API_KEY`). Genera una:

```bash
openssl rand -hex 24
```

Copia el resultado. Debes ponerlo en **DOS lugares**:

- **En la app (Coolify):** agrega la variable de entorno
  `BOT_API_KEY = <la clave>` y vuelve a desplegar la app.
- **En el bot:** se la pasas al arrancarlo (ver abajo).

### 4. Primer arranque y escaneo del QR

```bash
cd /opt/wifired/bot
BOT_API_KEY="<la clave>" API_URL="http://localhost:8081" node whatsapp-bot.js
```

Aparecerá un **código QR** en la pantalla. En el teléfono con el WhatsApp de la
empresa: **WhatsApp → Dispositivos vinculados → Vincular un dispositivo** y
escanéalo. Cuando veas `✅ Bot conectado y escuchando`, ¡ya funciona! Pruébalo
escribiéndole al número desde otro teléfono.

> `API_URL` es la dirección local de la app. En este servidor la app está en el
> puerto **8081** (`http://localhost:8081`). Si algún día cambia, ajústalo.

### 5. Dejarlo corriendo siempre (con PM2)

Para que el bot siga vivo aunque cierres SSH o se reinicie el servidor:

```bash
npm install -g pm2
cd /opt/wifired/bot
BOT_API_KEY="<la clave>" API_URL="http://localhost:8081" pm2 start whatsapp-bot.js --name wifired-bot
pm2 save
pm2 startup    # ejecuta el comando que te imprima
```

Comandos útiles:

```bash
pm2 logs wifired-bot     # ver lo que hace (y el QR la primera vez)
pm2 restart wifired-bot  # reiniciar
pm2 stop wifired-bot     # detener
```

---

## Actualizar el bot más adelante

```bash
cd /opt/wifired && git pull
cd bot && npm install
pm2 restart wifired-bot
```

## Configurar el bot desde la app (sin tocar código)

En la app, entra a **⚙ Configuración → 🤖 Bot de WhatsApp**. Desde ahí, la
coordinación puede editar sin reiniciar nada:

- **Bot activo** — enciende/apaga las respuestas automáticas.
- **Saludo del menú** — la primera frase que ve el cliente.
- **Texto de los planes** — lo que se envía con el botón "Enviar planes por
  WhatsApp" desde un ticket de Contratación (después de marcarlo Factible).
- **Horario de atención** — y el mensaje que se envía fuera de horario.

El bot lee esta configuración cada minuto, así que los cambios se aplican solos.

## Automatizaciones incluidas

- **Tickets automáticos** por cada solicitud del cliente (con su categoría).
- **Envío de planes**: al marcar un ticket como Factible y tocar "Enviar
  planes por WhatsApp", el bot se los manda al cliente.
- **Consulta de visita**: si el cliente elige "Agendar o consultar una visita",
  el bot busca su visita por teléfono y le informa el estado.
- **Aviso de ticket nuevo**: en la app, el menú "Tickets" muestra un contador
  rojo y un aviso cuando entra una solicitud nueva.

## Cambiar el orden/estructura del menú

El menú y los flujos (las 5 opciones) están en `whatsapp-bot.js`
(`menuText()` y `FLOWS`). Se editan y luego `pm2 restart wifired-bot`. Los
textos del saludo, planes y horario NO: esos se editan desde la app.
