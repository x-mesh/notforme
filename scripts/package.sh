#!/usr/bin/env bash
# Builds dist/notforme-extension-<version>.zip from extension/.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('$root/extension/manifest.json').version")"
out="$root/dist"

mkdir -p "$out"
rm -f "$out/notforme-extension-$version.zip"
(cd "$root/extension" && zip -qr "$out/notforme-extension-$version.zip" . -x '*.DS_Store')

echo "$out/notforme-extension-$version.zip"
