# ============================================================
# WIFIRED · Agenda de Visitas — imagen de producción
# Servidor Node sin dependencias que sirve la SPA estática.
# ============================================================
FROM node:20-alpine

WORKDIR /app

# La app no tiene dependencias npm: copiamos el código directamente.
COPY . .

# Railway inyecta PORT; el servidor lo toma de process.env.PORT.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
