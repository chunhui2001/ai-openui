#!/bin/sh
set -eu

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}/"

sed "s|__OLLAMA_BASE_URL__|${OLLAMA_BASE_URL}|g" \
  /usr/local/etc/h2o.conf.template > /tmp/h2o.conf

exec h2o -c /tmp/h2o.conf
