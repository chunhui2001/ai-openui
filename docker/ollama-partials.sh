#!/bin/bash

set -euo pipefail

ollama-partials() {
  local model="$1" repo tag

  repo="${model%%:*}"
  tag="${model#*:}"
  [[ "$repo" == "$tag" ]] && tag="latest"

  curl -fsSL "https://registry.ollama.ai/v2/library/${repo}/manifests/${tag}" |
  jq -r '.layers[].digest' |
  sed 's/^sha256:/sha256-/' |

  while read -r blob; do
    find ~/.ollama/models/blobs -maxdepth 1 -type f -name "${blob}-partial-*" -print

  done
}

if [[ $# -ne 1 ]]; then
  echo "用法：$0 <模型名[:标签]>" >&2
  exit 2
fi

ollama-partials "$1"
