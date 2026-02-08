# --- Build stage ---
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production stage ---
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist/ ./dist/

VOLUME /app/data

ENV TELEGRAM_SESSION_PATH=/app/telegram.session \
    DATA_DIR=/app/data

ENTRYPOINT ["node", "dist/index.js"]
