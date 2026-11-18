# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/

RUN npm install

COPY packages/shared ./packages/shared
RUN npm run build:shared

COPY backend ./backend
RUN npm run prisma:generate
RUN npm run build:api

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY package*.json tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/

RUN npm install --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000

CMD ["node", "backend/dist/interfaces/http/server.js"]
