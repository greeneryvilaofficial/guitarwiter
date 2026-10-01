import sys

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

PERMISSION_TAG = '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    '

if "android.permission.RECORD_AUDIO" in content:
    print("Izin RECORD_AUDIO sudah ada, lewati.")
    sys.exit(0)

if "<application" not in content:
    print("Tidak menemukan tag <application>, manifest tidak diubah.")
    sys.exit(1)

# Sisipkan <uses-permission> tepat sebelum <application ...>, sesuai aturan Android
# (uses-permission harus jadi anak langsung <manifest>, sejajar dengan <application>).
content = content.replace("<application", PERMISSION_TAG + "<application", 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Izin RECORD_AUDIO berhasil ditambahkan ke AndroidManifest.xml")
