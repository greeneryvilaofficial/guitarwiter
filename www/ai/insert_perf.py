import sys

# Dipanggil sebagai: python3 insert_perf.py <android/app/build.gradle>
#
# Kenapa: APK "debug" bawaan Gradle bersifat debuggable=true. Aplikasi debuggable dikompilasi ART
# dengan mode --debuggable (inlining/optimasi dimatikan) sehingga loop deteksi nada (YIN) di thread
# audio dan semua kode Java lain jalan lebih lambat dibanding APK release. Di sini build "debug"
# tetap ditandatangani kunci debug (tetap bisa dipasang biasa) tapi debuggable=false.
# Idempotent: aman dijalankan berkali-kali.
# PENTING: blok debug TIDAK boleh memuat teks "minifyEnabled false" -- insert_signing.py memakai teks itu
# sebagai anchor (kemunculan pertama) untuk menyisipkan signingConfig ke blok RELEASE.

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if "GUITARWITER_PERF" in content:
    print("Patch performa sudah ada, lewati.")
    sys.exit(0)

if "buildTypes {" not in content:
    print("FATAL: tidak menemukan blok buildTypes { di build.gradle.")
    sys.exit(1)

block = """buildTypes {
        // GUITARWITER_PERF: debug dibuat non-debuggable supaya secepat release
        debug {
            debuggable false
        }"""
content = content.replace("buildTypes {", block, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("OK: build debug dibuat non-debuggable (lebih cepat).")
