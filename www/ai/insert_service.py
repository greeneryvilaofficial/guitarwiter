import sys

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if "HtmlKeyboardService" in content:
    print("Service sudah terdaftar, lewati.")
    sys.exit(0)

service_block = """    <service
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

content = content.replace("</application>", service_block, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Service berhasil ditambahkan ke AndroidManifest.xml")
