#!/usr/bin/env python3
"""[LABEL INFO APLIKASI] Samakan versi yang tampil di Info Aplikasi Android dengan package.json.

Template Capacitor memberi android/app/build.gradle  versionCode 1 / versionName "1.0".
Skrip ini menimpanya dengan versi dari package.json (mis. 1.3.8 -> versionName "1.3.8", versionCode 10308).
Pakai:  python3 native-patches/insert_version.py android/app/build.gradle [package.json]
"""
import json, re, sys

gradle = sys.argv[1]
pkg = sys.argv[2] if len(sys.argv) > 2 else "package.json"

version = json.load(open(pkg, encoding="utf-8"))["version"]
m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
if not m:
    sys.exit("FATAL: versi di %s bukan format x.y.z: %r" % (pkg, version))
code = int(m[1]) * 10000 + int(m[2]) * 100 + int(m[3])   # 1.3.8 -> 10308 (naik terus tiap versi)

s = open(gradle, encoding="utf-8").read()
s, n1 = re.subn(r'versionName\s*=?\s*"[^"]*"', 'versionName "%s"' % version, s)
s, n2 = re.subn(r'versionCode\s*=?\s*\d+', 'versionCode %d' % code, s)
if n1 != 1 or n2 != 1:
    sys.exit("FATAL: versionName/versionCode tidak ditemukan tepat satu kali di %s (nama=%d, kode=%d)" % (gradle, n1, n2))
open(gradle, "w", encoding="utf-8").write(s)
print("OK: %s -> versionName %s, versionCode %d" % (gradle, version, code))
