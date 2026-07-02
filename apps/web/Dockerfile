# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22 AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci -w @blitzon/shared -w @blitzon/web

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @blitzon/shared && npm run build -w @blitzon/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
