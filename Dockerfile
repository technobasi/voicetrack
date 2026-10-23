# Multi-stage Build für VoiceTrack (React + Vite + TypeScript PWA)

# 1. Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package.json package-lock.json ./
RUN npm ci

# Quellcode kopieren und bauen
COPY . .
RUN npm run build

# 2. Production Stage mit Nginx
FROM nginx:alpine AS runner

# Standard Nginx-Konfiguration und Inhalte entfernen
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Eigene Nginx-Konfiguration für SPA, PWA-Caching & Headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Erstellte statische Web-Dateien aus der Build-Stage kopieren
COPY --from=builder /app/dist /usr/share/nginx/html

# Coolify Port
EXPOSE 80

# Healthcheck für Container-Status in Coolify
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
