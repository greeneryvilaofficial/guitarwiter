Simulator detektor: menjalankan NativeMicPitchDetector.java ASLI (tanpa diubah) dengan stub Android
(android/, androidx/) dan AudioRecord palsu yang memutar sinyal sintetis secara real-time.

  tools/sim/run.sh single                    # 6 petikan tunggal, cetak latensi per petikan
  tools/sim/run.sh rapid                     # 7 nada berurutan tiap 220 ms
  tools/sim/run.sh list 0.4 69 77 78 80 83   # tuts fungsi (A4 F5 F#5 G#5 B5) dipetik sengaja
  tools/sim/run.sh echoh 300 0.1             # D3 keras lalu A4 pelan 300 ms kemudian (overtone/gema)
  tools/sim/run.sh ring hp=150 agc           # dengung panjang lewat high-pass + AGC ala mic HP

OvTest.java menguji overtoneVerdict() langsung lewat refleksi (jendela audio sintetis):
  javac -encoding UTF-8 -d out $(find . -name '*.java') <detektor ditaruh di com/keyboardkustom/app/>
  java -Don=900 -cp out OvTest

Catatan: ini SIMULASI. Sinyal sintetis tidak sama dengan gitar/HP asli; angka latensi tidak termasuk
latensi audio masuk Android (AudioRecord).
