import sys

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

DEP_LINE = '    implementation "androidx.webkit:webkit:1.10.0"\n'

if "androidx.webkit:webkit" in content:
    print("Dependency androidx.webkit sudah ada, lewati.")
    sys.exit(0)

if "dependencies {" not in content:
    print("FATAL: tidak menemukan blok dependencies { di build.gradle.")
    sys.exit(1)

content = content.replace("dependencies {", "dependencies {\n" + DEP_LINE, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Dependency androidx.webkit berhasil ditambahkan ke build.gradle")
