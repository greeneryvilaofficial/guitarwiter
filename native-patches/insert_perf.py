"""Membuat build "debug" non-debuggable supaya secepat release.

APK debug bawaan Gradle bersifat debuggable=true, sehingga ART mematikan optimasi (inlining dsb.)
dan loop deteksi nada di thread audio jadi lebih lambat. Build debug tetap ditandatangani kunci
debug (bisa dipasang biasa), hanya saja debuggable=false.

Pemakaian: python3 insert_perf.py <android/app/build.gradle>
Aman dijalankan berkali-kali (idempotent).

PENTING: blok debug TIDAK boleh memuat teks "minifyEnabled false". insert_signing.py memakai
kemunculan pertama teks itu sebagai anchor untuk menyisipkan signingConfig ke blok RELEASE.
"""
import sys
from pathlib import Path

MARKER = "GUITARWITER_PERF"

DEBUG_BLOCK = """buildTypes {
        // GUITARWITER_PERF: debug dibuat non-debuggable supaya secepat release
        debug {
            debuggable false
        }"""


def main() -> int:
    if len(sys.argv) < 2:
        print("Pemakaian: python3 insert_perf.py <build.gradle>")
        return 1

    path = Path(sys.argv[1])
    content = path.read_text(encoding="utf-8")

    if MARKER in content:
        print("Patch performa sudah ada, lewati.")
        return 0
    if "buildTypes {" not in content:
        print("FATAL: blok buildTypes { tidak ditemukan di build.gradle.")
        return 1

    path.write_text(content.replace("buildTypes {", DEBUG_BLOCK, 1), encoding="utf-8")
    print("OK: build debug dibuat non-debuggable (lebih cepat).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
