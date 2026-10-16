FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS server-runtime
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
COPY --from=client-builder /app/client/dist /app/client/dist
RUN mkdir -p /app/uploads /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL=file:/app/data/dev.db

EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push && node src/index.js"]
