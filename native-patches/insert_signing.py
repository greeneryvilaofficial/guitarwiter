"""Menambahkan signingConfig release (null-safe) ke build.gradle.

Kode di dalam android { } dievaluasi Gradle setiap build.gradle dibaca, termasuk saat assembleDebug
yang TIDAK diberi env var KEYSTORE_PATH (hanya di-set untuk assembleRelease). Karena itu
getenv() dicek dulu; tanpa pengecekan, assembleDebug ikut crash.

Urutan: jalankan SETELAH insert_perf.py. Anchor "minifyEnabled false" (kemunculan pertama) harus
berada di blok release bawaan template Capacitor.

Pemakaian: python3 insert_signing.py <android/app/build.gradle>
Aman dijalankan berkali-kali (idempotent).
"""
import sys
from pathlib import Path

SIGNING_CONFIGS_BLOCK = """android {
    signingConfigs {
        release {
            def ksPath = System.getenv("KEYSTORE_PATH")
            if (ksPath != null && !ksPath.isEmpty()) {
                storeFile file(ksPath)
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
"""

RELEASE_ANCHOR = "minifyEnabled false"
RELEASE_REPLACEMENT = "signingConfig signingConfigs.release\n            minifyEnabled false"


def main() -> int:
    if len(sys.argv) < 2:
        print("Pemakaian: python3 insert_signing.py <build.gradle>")
        return 1

    path = Path(sys.argv[1])
    content = path.read_text(encoding="utf-8")

    if "signingConfigs" in content:
        print("Signing config sudah ada, lewati.")
        return 0
    # Gagal keras daripada diam-diam menghasilkan APK release yang tidak bertanda tangan.
    for anchor in ("android {", RELEASE_ANCHOR):
        if anchor not in content:
            print(f'FATAL: anchor "{anchor}" tidak ditemukan di build.gradle.')
            return 1

    content = content.replace("android {", SIGNING_CONFIGS_BLOCK, 1)
    content = content.replace(RELEASE_ANCHOR, RELEASE_REPLACEMENT, 1)
    path.write_text(content, encoding="utf-8")
    print("OK: signing config (null-safe) ditambahkan ke build.gradle")
    return 0


if __name__ == "__main__":
    sys.exit(main())
