import sys

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if "signingConfigs" in content:
    print("Signing config sudah ada, lewati.")
    sys.exit(0)

# PENTING: blok ini dibuat "null-safe" dengan pengecekan getenv() dulu.
# Kenapa? Karena kode di dalam android{} dievaluasi Gradle SETIAP KALI
# build.gradle dibaca -- termasuk saat menjalankan assembleDebug, yang
# TIDAK dikasih env var KEYSTORE_PATH sama sekali (itu cuma di-set saat
# assembleRelease). Tanpa pengecekan ini, assembleDebug ikut crash gara-gara
# System.getenv("KEYSTORE_PATH") bernilai null dan dipaksa dipakai sebagai path file.
signing_configs_block = """android {
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
content = content.replace("android {", signing_configs_block, 1)

# Tambahkan "signingConfig signingConfigs.release" di dalam blok release buildTypes.
# Anchor: baris "minifyEnabled" yang selalu ada bawaan template Capacitor.
content = content.replace(
    "minifyEnabled false",
    "signingConfig signingConfigs.release\n            minifyEnabled false",
    1
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Signing config (null-safe) berhasil ditambahkan ke build.gradle")
