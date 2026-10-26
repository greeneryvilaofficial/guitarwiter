import sys
import os
import shutil

# Dipanggil sebagai: python3 insert_icon.py <path_ke_android/app/src/main/res> <path_ke_native-patches/app-icon>
#
# Kenapa dibikin script terpisah (bukan cuma "cp -r" langsung di YAML): supaya
# logikanya konsisten dengan insert_permission.py / insert_service.py / dkk --
# aman dijalankan berkali-kali (idempotent), dan kasih pesan jelas kalau ada
# folder sumber yang kelewatan (misalnya lupa nge-commit satu mipmap density).

if len(sys.argv) < 3:
    print("Pemakaian: python3 insert_icon.py <res_dir> <app_icon_src_dir>")
    sys.exit(1)

res_dir = sys.argv[1]
icon_src_root = sys.argv[2]

# ---- Timpa ikon launcher default Capacitor (mipmap-*) dengan foto pribadi ----
MIPMAP_FOLDERS = [
    "mipmap-mdpi",
    "mipmap-hdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
    "mipmap-anydpi-v26",  # adaptive icon (ic_launcher.xml + ic_launcher_round.xml)
]

any_copied = False
for folder in MIPMAP_FOLDERS:
    src = os.path.join(icon_src_root, folder)
    dst = os.path.join(res_dir, folder)
    if not os.path.isdir(src):
        print(f"PERINGATAN: {src} tidak ditemukan di repo, folder ini dilewati.")
        continue
    os.makedirs(dst, exist_ok=True)
    for fname in os.listdir(src):
        shutil.copy(os.path.join(src, fname), os.path.join(dst, fname))
    any_copied = True
    print(f"OK: isi {folder} ditimpa dengan ikon foto pribadi.")

if not any_copied:
    print("FATAL: tidak ada satupun folder mipmap sumber yang ditemukan -- cek path app-icon di repo.")
    sys.exit(1)

# ---- Set warna latar adaptive icon ----
# PENTING: template default Capacitor (hasil `cap add android`) SUDAH otomatis
# menyediakan file values/ic_launcher_background.xml berisi <color name="ic_launcher_background">.
# Kalau kita tambah warna dengan NAMA SAMA ke colors.xml (file berbeda), Android
# menganggapnya resource duplikat walau beda file -- build gagal ("Duplicate resources").
# Makanya di sini kita TIMPA LANGSUNG file ic_launcher_background.xml yang sudah
# ada itu, bukan menambah entri baru di colors.xml.
bg_color_path = os.path.join(res_dir, "values", "ic_launcher_background.xml")
os.makedirs(os.path.dirname(bg_color_path), exist_ok=True)

with open(bg_color_path, "w", encoding="utf-8") as f:
    f.write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#111111</color>\n'
        "</resources>\n"
    )
print("Warna ic_launcher_background ditimpa di values/ic_launcher_background.xml (bukan colors.xml).")

print("Selesai: ikon launcher foto pribadi terpasang.")
