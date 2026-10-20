# ---- deps: instala as dependências (camada cacheada enquanto o lock não muda) ----
FROM node:22-alpine AS deps
ENV NG_CLI_ANALYTICS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
    # ferramentas que o ng serve/build não usa (lint, formatação, testes)
    && npm rm --no-save --no-audit --no-fund \
       eslint @eslint/js angular-eslint typescript-eslint prettier \
       karma karma-chrome-launcher karma-coverage karma-jasmine \
       karma-jasmine-html-reporter jasmine-core @types/jasmine \
    && npm cache clean --force


# ---- dev: ng serve com hot reload (código vem por bind mount no compose) ----
# alpine + nodejs puro: sem npm/yarn, bem menor que a imagem node:alpine
FROM alpine:3.22 AS dev
RUN apk add --no-cache nodejs
ENV NG_CLI_ANALYTICS=false
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node_modules/.bin/ng", "serve", "--host", "0.0.0.0", "--port", "3000", "--proxy-config", "proxy.docker.conf.json"]


# ---- build: gera o bundle de produção ----
FROM deps AS build
COPY . .
RUN node_modules/.bin/ng build --configuration production


# ---- prod: apenas nginx + arquivos estáticos ----
FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
