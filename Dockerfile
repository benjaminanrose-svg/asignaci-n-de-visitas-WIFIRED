# ============================================================
# WIFIRED · Agenda de Visitas — imagen de producción
# Backend Express + PostgreSQL sirviendo la SPA.
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Instala dependencias primero (mejor cacheo de capas)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia el resto del código
COPY . .

# Railway inyecta PORT; el servidor lo toma de process.env.PORT.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
