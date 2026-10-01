"""Mendaftarkan HtmlKeyboardService (IME) di AndroidManifest.xml.

Pemakaian: python3 insert_service.py <android/app/src/main/AndroidManifest.xml>
Aman dijalankan berkali-kali (idempotent).
"""
import sys
from pathlib import Path

SERVICE_BLOCK = """    <service
        android:name=".HtmlKeyboardService"
        android:label="Guitarwiter"
        android:permission="android.permission.BIND_INPUT_METHOD"
        android:exported="true">
        <meta-data
            android:name="android.view.im"
            android:resource="@xml/method" />
        <intent-filter>
            <action android:name="android.view.InputMethod" />
        </intent-filter>
    </service>
</application>"""


def main() -> int:
    if len(sys.argv) < 2:
        print("Pemakaian: python3 insert_service.py <AndroidManifest.xml>")
        return 1

    path = Path(sys.argv[1])
    content = path.read_text(encoding="utf-8")

    if "HtmlKeyboardService" in content:
        print("Service sudah terdaftar, lewati.")
        return 0
    if "</application>" not in content:
        print("FATAL: tag </application> tidak ditemukan, manifest tidak diubah.")
        return 1

    path.write_text(content.replace("</application>", SERVICE_BLOCK, 1), encoding="utf-8")
    print("OK: service ditambahkan ke AndroidManifest.xml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
