#!/usr/bin/env bash
# Builds dist/chess/ (the folder to copy to the tablet) and dist/chess.zip
set -euo pipefail
cd "$(dirname "$0")"

RCC="$(command -v rcc || command -v rcc6 || true)"
if [ -z "$RCC" ]; then
  for p in /opt/homebrew/share/qt/libexec/rcc /opt/homebrew/opt/qt/share/qt/libexec/rcc /opt/homebrew/opt/qt/libexec/rcc; do
    if [ -x "$p" ]; then RCC="$p"; break; fi
  done
fi
if [ -z "$RCC" ]; then echo "rcc not found. Install Qt with: brew install qt"; exit 1; fi

node tests/test.js
rm -rf dist && mkdir -p dist/chess
"$RCC" --binary -o dist/chess/resources.rcc src/resources.qrc
cp package/manifest.json package/icon.png dist/chess/
# keep the web demo in sync with the tablet app
cp src/qml/chess.js docs/chess.js
mkdir -p docs/pieces && cp src/qml/pieces/*.png docs/pieces/
(cd dist && zip -qr chess.zip chess)
echo "Built dist/chess and dist/chess.zip"
