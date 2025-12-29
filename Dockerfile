# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 2: Build backend and combine
FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY server/package*.json ./
RUN apk add --no-cache openssl
RUN npm install

# Copy server code
COPY server/ ./

# Copy frontend build to public folder
COPY --from=frontend-builder /app/web/dist ./public

# Generate Prisma Client
RUN npx prisma generate

# Create data directory
RUN mkdir -p /app/data

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "index.js"]
