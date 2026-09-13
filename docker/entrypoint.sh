#!/bin/sh
set -eu

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}/"
WHISPER_BASE_URL="${WHISPER_BASE_URL:-http://host.docker.internal:8173}"
WHISPER_BASE_URL="${WHISPER_BASE_URL%/}/"
TTS_BASE_URL="${TTS_BASE_URL:-http://host.docker.internal:8273}"
TTS_BASE_URL="${TTS_BASE_URL%/}/"

sed -e "s|__OLLAMA_BASE_URL__|${OLLAMA_BASE_URL}|g" \
    -e "s|__WHISPER_BASE_URL__|${WHISPER_BASE_URL}|g" \
    -e "s|__TTS_BASE_URL__|${TTS_BASE_URL}|g" \
  /usr/local/etc/h2o.conf.template > /tmp/h2o.conf

rm -f /tmp/h2o-access
mkfifo /tmp/h2o-access
perl /usr/local/bin/access-log-filter.pl < /tmp/h2o-access &
# perl /usr/local/bin/get-server.pl &

exec h2o -c /tmp/h2o.conf
