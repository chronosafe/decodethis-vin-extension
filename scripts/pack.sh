#!/bin/sh
# Builds dist/decodethis-vin-lookup.zip: the manifest, the icons and the source, nothing else.
#
# The file list is explicit on purpose. The zip is what gets uploaded to the Chrome Web
# Store, so it must never pick up tests, docs, git data or editor/tool state by accident.
# test/pack.test.js keeps this list in step with the source.
#
# Needs the zip and unzip commands.
set -eu
cd "$(dirname "$0")/.."

for tool in zip unzip; do
  command -v "$tool" >/dev/null 2>&1 || { echo "pack: '$tool' is required but was not found" >&2; exit 1; }
done

out=dist/decodethis-vin-lookup.zip
mkdir -p dist
# Build beside the final name and move it into place, so a failed run never leaves a missing or half-written zip.
tmp="$out.tmp"
rm -f "$tmp"
zip -X -q "$tmp" manifest.json icons/icon16.png icons/icon48.png icons/icon128.png src/background.js src/destination.js src/vin.js
mv -f "$tmp" "$out"

echo "Built $out containing:"
unzip -Z1 "$out"
