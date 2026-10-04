#!/bin/bash
# Pakai:  tools/sim/run.sh <skenario...>     (butuh JDK 17+: JAVA_HOME atau `javac` di PATH)
# Skenario: single | single_soft | rapid | repeat | voice | seq <gap_dtk> <amp> | ring [hp=150] [agc]
#           harm <profil,harmonik> [hp=N] | list <amp> <midi...> | echoh <gap_ms> <amp2>
# Opsi tambahan di akhir: hp=<Hz> (high-pass mic HP), agc (penguat otomatis kasar)
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/../.."
JAVAC=${JAVA_HOME:+$JAVA_HOME/bin/}javac; JAVA=${JAVA_HOME:+$JAVA_HOME/bin/}java
d=$(mktemp -d); mkdir -p $d/src/com/keyboardkustom/app
cp -r "$here/android" "$here/androidx" "$here/Harness.java" $d/src/
cp "$root/native-patches/NativeMicPitchDetector.java" $d/src/com/keyboardkustom/app/
$JAVAC -encoding UTF-8 -d $d/out $(find $d/src -name '*.java') && $JAVA -cp $d/out Harness "$@"
rm -rf $d
