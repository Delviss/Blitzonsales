# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22

WORKDIR /app

# Install workspace dependencies (dev deps included: migrations/seed run via ts-node)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci -w @blitzon/shared -w @blitzon/api

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @blitzon/shared && npm run build -w @blitzon/api

EXPOSE 3001
CMD ["sh", "apps/api/docker-entrypoint.sh"]
