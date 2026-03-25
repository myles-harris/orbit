FROM node:20-alpine

WORKDIR /app

# OpenSSL is required by Prisma
RUN apk add --no-cache openssl

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install all workspace dependencies
RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/

# Build shared types package (server depends on its dist/)
RUN npm run build -w packages/shared

# Generate Prisma client
RUN npx prisma generate --schema=apps/server/prisma/schema.prisma

# Compile server TypeScript
RUN npm run build -w apps/server

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/server/prisma/schema.prisma && node apps/server/dist/index.js"]
