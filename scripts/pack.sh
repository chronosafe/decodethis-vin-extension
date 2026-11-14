#!/bin/sh
# Builds dist/decodethis-vin-lookup.zip: the manifest, the icons and the source, nothing else.
#
# The file list is explicit on purpose. The zip is what gets uploaded to the Chrome Web
# Store, so it must never pick up tests, docs, git data or editor/tool state by accident.
set -eu
cd "$(dirname "$0")/.."

out=dist/decodethis-vin-lookup.zip
mkdir -p dist
rm -f "$out"
zip -X -q "$out" manifest.json icons/icon16.png icons/icon48.png icons/icon128.png src/background.js src/destination.js src/vin.js

echo "Built $out containing:"
unzip -Z1 "$out"
