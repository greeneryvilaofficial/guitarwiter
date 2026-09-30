#!/usr/bin/env bash
# Jalankan dari ROOT repo. Pemakaian: bash push-drum-spasi.sh /path/ke/folder-unduhan
set -e
SRC="${1:-.}"
for f in native-patches/NativeMicPitchDetector.java www/index.html www/sw.js; do
  test -f "$SRC/$f" || { echo "FATAL: $SRC/$f tidak ada"; exit 1; }
  cp "$SRC/$f" "$f"
done
git add native-patches/NativeMicPitchDetector.java www/index.html www/sw.js
git commit -m "Kick yang terbaca nada bass (G2/G#2) dianggap ketukan drum -> spasi"
git push origin main
