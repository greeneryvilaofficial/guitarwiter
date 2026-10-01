"""Menambahkan dependency androidx.webkit (WebViewAssetLoader, WebMessageListener) ke build.gradle.

Pemakaian: python3 insert_webkit_dependency.py <android/app/build.gradle>
Aman dijalankan berkali-kali (idempotent).
"""
import sys
from pathlib import Path

DEPENDENCY_LINE = '    implementation "androidx.webkit:webkit:1.10.0"\n'


def main() -> int:
    if len(sys.argv) < 2:
        print("Pemakaian: python3 insert_webkit_dependency.py <build.gradle>")
        return 1

    path = Path(sys.argv[1])
    content = path.read_text(encoding="utf-8")

    if "androidx.webkit:webkit" in content:
        print("Dependency androidx.webkit sudah ada, lewati.")
        return 0
    if "dependencies {" not in content:
        print("FATAL: blok dependencies { tidak ditemukan di build.gradle.")
        return 1

    path.write_text(content.replace("dependencies {", "dependencies {\n" + DEPENDENCY_LINE, 1), encoding="utf-8")
    print("OK: dependency androidx.webkit ditambahkan ke build.gradle")
    return 0


if __name__ == "__main__":
    sys.exit(main())
