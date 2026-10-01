"""Menimpa ikon launcher default Capacitor dengan ikon aplikasi.

Pemakaian: python3 insert_icon.py <android/app/src/main/res> <native-patches/app-icon>
Aman dijalankan berkali-kali (idempotent); memberi peringatan jelas kalau ada folder sumber yang hilang.
"""
import shutil
import sys
from pathlib import Path

MIPMAP_FOLDERS = (
    "mipmap-mdpi",
    "mipmap-hdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
    "mipmap-anydpi-v26",  # adaptive icon (ic_launcher.xml + ic_launcher_round.xml)
)

LAUNCHER_BACKGROUND_XML = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#111111</color>
</resources>
"""


def copy_mipmaps(icon_root: Path, res_dir: Path) -> bool:
    copied_any = False
    for folder in MIPMAP_FOLDERS:
        source = icon_root / folder
        if not source.is_dir():
            print(f"PERINGATAN: {source} tidak ditemukan, folder ini dilewati.")
            continue
        target = res_dir / folder
        target.mkdir(parents=True, exist_ok=True)
        for file in source.iterdir():
            if file.is_file():
                shutil.copy(file, target / file.name)
        copied_any = True
        print(f"OK: isi {folder} ditimpa dengan ikon aplikasi.")
    return copied_any


def main() -> int:
    if len(sys.argv) < 3:
        print("Pemakaian: python3 insert_icon.py <res_dir> <app_icon_src_dir>")
        return 1

    res_dir = Path(sys.argv[1])
    icon_root = Path(sys.argv[2])

    if not copy_mipmaps(icon_root, res_dir):
        print("FATAL: tidak ada folder mipmap sumber yang ditemukan; cek path app-icon di repo.")
        return 1

    # Template Capacitor sudah punya values/ic_launcher_background.xml. Menambah warna bernama sama
    # di colors.xml dianggap resource duplikat oleh Android (build gagal), jadi file itu ditimpa langsung.
    background_path = res_dir / "values" / "ic_launcher_background.xml"
    background_path.parent.mkdir(parents=True, exist_ok=True)
    background_path.write_text(LAUNCHER_BACKGROUND_XML, encoding="utf-8")
    print("OK: warna ic_launcher_background ditimpa di values/ic_launcher_background.xml.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
