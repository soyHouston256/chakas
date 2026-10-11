# syntax=docker/dockerfile:1
# CHANKAS · imagen de producción (sitio estático).
# Etapa 1: ejecuta las pruebas (si fallan, falla el build) y arma /dist solo con lo necesario.
# Etapa 2: nginx sin privilegios (usuario 101, puerto 8080) sirviendo /dist.

FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /src
# .dockerignore es una lista blanca: data.txt, docs/, previews, .git... ni siquiera entran al contexto.
COPY package.json index.html style.css game.js ui.js ./
COPY art/ ./art/
COPY tests/ ./tests/
COPY scripts/ ./scripts/
COPY deploy/404.html ./deploy/404.html
RUN npm test && node scripts/build-dist.cjs /dist

FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
# FRAME_ANCESTORS: quién puede incrustar el juego en un <iframe> (CSP frame-ancestors).
# envsubst solo toca esa variable; la salida va a /tmp (compatible con read_only).
ENV FRAME_ANCESTORS="'self'" \
    NGINX_ENVSUBST_OUTPUT_DIR=/tmp/conf.d \
    NGINX_ENVSUBST_FILTER="^FRAME_ANCESTORS$"

USER root
# Quita el sitio y la configuración por defecto; la configuración queda de root (solo lectura
# para el proceso nginx, que corre como 101).
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf \
 && chown -R root:root /etc/nginx \
 && chmod -R go-w /etc/nginx
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf
COPY deploy/nginx/templates/ /etc/nginx/templates/
COPY --chmod=0755 deploy/nginx/15-chankas-prepare.sh /docker-entrypoint.d/15-chankas-prepare.sh
RUN rm -f /etc/nginx/templates/default.conf.template
COPY --from=build /dist/ /usr/share/nginx/html/
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
