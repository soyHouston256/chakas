#!/bin/sh
# Prepara /tmp/conf.d (destino de envsubst) y valida FRAME_ANCESTORS antes de 20-envsubst.
set -eu
out="${NGINX_ENVSUBST_OUTPUT_DIR:-/tmp/conf.d}"
mkdir -p "$out"
# Solo fuentes CSP simples: 'self', 'none', esquemas y hosts (con comodín). Nada de comillas
# dobles, ';' ni saltos de línea que pudieran romper la cabecera o la configuración.
case "${FRAME_ANCESTORS:-}" in
  "" ) echo "$0: ERROR: FRAME_ANCESTORS vacío (usa 'self' o 'none')" >&2; exit 1 ;;
  *[!A-Za-z0-9\ \'.:/*-]* ) echo "$0: ERROR: FRAME_ANCESTORS contiene caracteres no permitidos" >&2; exit 1 ;;
esac
echo "$0: frame-ancestors = ${FRAME_ANCESTORS}"
