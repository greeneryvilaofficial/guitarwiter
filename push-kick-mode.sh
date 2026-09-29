#!/usr/bin/env bash
# Jalankan dari ROOT repo Guitarwiter (yang punya folder www/ dan native-patches/).
# Pemakaian: bash push-kick-mode.sh /path/ke/folder/hasil-unduhan
set -e
SRC="${1:-.}"

for f in native-patches/NativeMicPitchDetector.java native-patches/HtmlKeyboardService.java www/index.html www/sw.js; do
  test -f "$SRC/$f" || { echo "FATAL: $SRC/$f tidak ada"; exit 1; }
  mkdir -p "$(dirname "$f")"
  cp "$SRC/$f" "$f"
done

# Patch lama sudah usang dan bentrok dengan kode baru -> hapus dari repo
# (riwayatnya tetap ada di git history kalau suatu saat dibutuhkan).
git rm -f --ignore-unmatch guitarwiter-*.patch release-fix.patch >/dev/null
rm -f guitarwiter-*.patch release-fix.patch guitarwiter-kick-mode.patch

git add native-patches/NativeMicPitchDetector.java native-patches/HtmlKeyboardService.java www/index.html www/sw.js
git commit -m "Deteksi senar + kick drum (kick -> spasi), mode 'nada saja', hapus patch lama"
git push origin main
