"""Menambahkan izin RECORD_AUDIO ke AndroidManifest.xml.

Pemakaian: python3 insert_permission.py <android/app/src/main/AndroidManifest.xml>
Aman dijalankan berkali-kali (idempotent).
"""
import sys
from pathlib import Path

PERMISSION_TAG = '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    '


def main() -> int:
    if len(sys.argv) < 2:
        print("Pemakaian: python3 insert_permission.py <AndroidManifest.xml>")
        return 1

    path = Path(sys.argv[1])
    content = path.read_text(encoding="utf-8")

    if "android.permission.RECORD_AUDIO" in content:
        print("Izin RECORD_AUDIO sudah ada, lewati.")
        return 0
    if "<application" not in content:
        print("FATAL: tag <application> tidak ditemukan, manifest tidak diubah.")
        return 1

    # <uses-permission> harus anak langsung <manifest>, sejajar dengan <application>.
    path.write_text(content.replace("<application", PERMISSION_TAG + "<application", 1), encoding="utf-8")
    print("OK: izin RECORD_AUDIO ditambahkan ke AndroidManifest.xml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
