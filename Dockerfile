# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build Backend & Combine
FROM node:20-alpine
WORKDIR /app

# Add dependencies required by Prisma / native modules
RUN apk add --no-cache openssl

# Install backend dependencies
COPY server/package*.json ./
RUN npm ci

# Copy backend source code including prisma schema
COPY server/ ./
RUN npx prisma generate

# Mount frontend dist output to backend public folder
COPY --from=frontend-builder /app/web/dist ./public

# Setup data persistence directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "docker-entrypoint.sh"]
