# 🎸 GuitarWiter — Guitar-to-Keyboard

Keyboard Android kustom yang mengubah **nada gitar jadi ketikan**. Petik satu nada → satu huruf/tombol keluar di kolom teks mana pun (WhatsApp, Instagram, dll.). Deteksi nada berjalan native (AudioRecord + YIN) di dalam aplikasi, sedangkan tampilan keyboard adalah halaman web (`www/`) di dalam WebView `InputMethodService`.

## Cara pakai
1. Pasang APK dari tab **Releases** (pakai `Guitarwiter.apk` kalau ada — itu build release yang paling ringan).
2. **Buka aplikasinya sekali** dari app drawer dan izinkan **mikrofon** (keyboard tidak bisa memunculkan pop-up izin sendiri).
3. Aktifkan di **Pengaturan → Bahasa & input → Papan ketik** lalu pilih **Guitarwiter** saat mengetik.
4. Nyalakan ikon mikrofon di keyboard, lalu petik **satu nada per satu** (bukan kunci penuh).

## Peta nada → tuts
Nada disusun kromatis (per setengah nada) dari **E2** (MIDI 40), 44 tuts. Label nada tampil di tiap tuts.

| Tuts | Nada |
|---|---|
| `1 2 3 4 5 6 7 8 9 0` (baris angka) | E2 – C#3 — **hanya aktif di mode simbol `?123`** |
| `q w e r t y u i o p` | D3 – B3 |
| `a s d f g h j k l` | C4 – G#4 |
| Shift | A4 |
| `z x c v b n m` | A#4 – E5 |
| Hapus ⌫ | F5 |
| `?123` | F#5 |
| `,` | G5 |
| Emoji | G#5 |
| Spasi | A5 |
| `.` | A#5 |
| Enter | B5 |

Di **mode huruf** nada rendah (E2–C#3) sengaja diabaikan karena baris angka tersembunyi. Di **mode emoji** 44 emoji bernada ada di bagian paling atas panel, dan nada mengetik emoji yang terlihat di situ.

## Struktur repo
```
.github/workflows/
  android-build.yml        # build APK debug (+ release kalau keystore tersedia) & buat GitHub Release
  generate-keystore.yml    # jalankan SEKALI untuk membuat keystore rilis
native-patches/            # ditempel ke proyek android/ yang dibuat otomatis oleh Capacitor
  HtmlKeyboardService.java     # InputMethodService + WebView + jembatan JS
  NativeMicPitchDetector.java  # rekam mic & deteksi nada (YIN) — inti kecepatan
  MainActivity.java            # minta izin mikrofon
  method.xml                   # deklarasi IME
  insert_*.py                  # skrip penyisip manifest/gradle/ikon/signing/performa
  app-icon/                    # ikon launcher (mipmap-*)
www/
  index.html  sw.js  manifest.json  (+ icon-192.png, icon-512.png)
capacitor.config.json
package.json
```

## Build (GitHub Actions)
Setiap push ke `main` membuat APK dan Release baru (`build-<nomor>`).
- **Debug**: selalu ada, tidak butuh keystore (`Guitarwiter-debug.apk`; dibuat non-debuggable supaya tetap cepat).
- **Release (bertanda tangan)**: isi dulu secret `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` (password keystore dan key **harus sama**), jalankan **Generate Release Keystore** sekali, salin hasil base64-nya ke secret `KEYSTORE_BASE64`, lalu hapus artifact keystore-nya.
- Setelah mengubah `www/index.html`, naikkan nomor versi `CACHE_NAME` di `www/sw.js` supaya cache lama tidak nyangkut.

## Setelan yang bisa disetel (di kode)
`NativeMicPitchDetector.java`:
| Konstanta | Fungsi |
|---|---|
| `KICK_FEATURE` | `false` = drum/kick tidak pernah jadi spasi (bunyi non-nada diabaikan) |
| `PITCH_MODE_TOGGLE_KEYS` | `true` = `?123`/emoji bisa dipicu dari nada; `false` = hanya lewat sentuhan |
| `FUNCTIONAL_KEYS_STRICT` | **`true` (v1.3.4)**: Shift/Hapus/`?123`/Emoji/Enter butuh 3 bacaan sepakat, umur minimum, tidak dipaksa komit, dan tidak lewat jalur cepat. Spasi/koma/titik tetap cepat |
| `OVERTONE_*` | **(v1.3.4)** pengaman tuts fungsi: sebelum Shift/Hapus/`?123`/Emoji/Enter diketik, spektrum dicek apakah bacaan itu cuma overtone nada yang lebih rendah (A4 = 3x D3 `q`, F#5 = 2x F#4 `j`, F5 = 2x F4 `h`, B5 = 3x E4 `g`). Hanya tenaga BARU sejak onset yang dihitung, jadi nada lama yang masih berdengung tidak mengganggu. Overtone dibuang (atau diarahkan ke nada dasar kalau jelas ada). Salah buang tombol fungsi sungguhan? naikkan `OVERTONE_VETO_RATIO` (mis. 0.02) |
| `HARMONIC_ECHO_*` | **(v1.3.4)** tuts fungsi yang jatuh di overtone nada yang barusan diketik (dalam 700 ms) hanya diterima kalau petikannya >= 60% sekeras petikan sebelumnya |
| `FAST_*` | jalur cepat nada pertama (hanya >= 300 Hz, syarat ketat) |
| `LOW_ZONE_*` (66 / 50 ms) | nada < 300 Hz menunggu data lebih banyak (mencegah salah oktaf angka↔huruf). Dikembalikan ke nilai bersih v1.1.3 (v1.3.2 memakai 50 / 33 dan lebih sering salah tempat) |
| `ONSET_RMS`, `RETRIGGER_*`, `COOLDOWN_MS` | sensitivitas petikan; terlalu sensitif = huruf berulang/acak |
| `TOUCH_MUTE_MS` | sesudah tuts disentuh jari, onset mic dibungkam sebentar (getar/klik/ketukan jari tidak jadi huruf hantu) |
| `ECHO_WINDOW_MS`, `ECHO_SAME_NOTE_PEAK`, `ECHO_OTHER_NOTE_PEAK` | gerbang anti-gema: petikan baru dalam jendela ini harus cukup keras dibanding petikan sebelumnya, kalau tidak dianggap dengungan & diabaikan |
| `SAME_NOTE_WINDOW_MS`, `SAME_NOTE_VALLEY_RATIO` | nada SAMA dalam jendela panjang harus didahului lembah beneran (puncak >= 1.8x level terpelan sejak komit terakhir) |
| `RELEASE_RMS` (0.009) | sengaja di bawah `ONSET_RMS` (0.012): hysteresis supaya riak ring tidak melepas kunci lalu dibaca petikan baru |

## Yang berubah di v1.3.7 (tuts p, a, s kurang responsif)
- **Penyebab**: B3/C4/C#4 (p, a, s) setengah frekuensinya jatuh di 123-139 Hz, zona angka. Energi di sana dari resonansi badan gitar/dengung mic ikut dianggap bukti "nada ini sebenarnya satu oktaf lebih rendah", lalu bacaan diturunkan jadi angka dan dibuang di mode huruf (terasa tuts tidak merespons).
- **Perbaikan** (`yinCore`, juga di `index.html`): turun oktaf sekarang WAJIB punya harmonik ganjil (1.5x atau 2.5x frekuensi terbaca; `ODD_EVIDENCE_*`). Nada rendah sungguhan punya, resonansi tidak.
- `HP_ACCEPT_MIN_FREQ` dan `LOW_ZONE_FAST_AGE_MIN_FREQ` 255 -> 240 Hz supaya B3 (246,9 Hz) diperlakukan sama seperti a, s.
- Simulasi (`tools/vsim`, skenario baru `hl` + `res=`): tuts p gagal 16/24 -> 0/24, total gagal 295 -> 243 dari 1056. Skenario lama (single, rapid, repeat, rep, harm, list, echoh) hasilnya identik dengan v1.3.6.
- **Batas**: resonansi sangat kuat tepat di frekuensi angka (95-135 Hz) masih bisa membuat angka tidak terdeteksi, dan tuts fungsi (Shift/Hapus/?123/Emoji/Enter) masih sering gagal di kondisi itu. Semua angka adalah simulasi sinyal sintetis, bukan gitar/HP asli.

## Yang berubah di v1.3.6 (petikan beruntun: tanpa dobel, tidak ada yang hilang)
Semua perubahan di `NativeMicPitchDetector.java`; `index.html` tidak berubah. Diuji dengan simulator deterministik `tools/vsim/` (lihat bagian Pengujian), dibandingkan dengan v1.3.5 pada skenario yang sama.
- **Petikan di atas dengung dibaca dari sampel SESUDAH onset saja** (`RETRIG_FULL_TAIL`). Jendela 85 ms masih ~80% berisi nada lama di ~17-33 ms pertama; dulu jalur cepat/jendela penuh membacanya sebagai nada lama lagi = **huruf dobel** (nada 71 terketik dua kali, nada baru hilang). Jalur cepat tidak dipakai untuk retrigger.
- **Pemicu onset kedua berbasis transien** (`FLUX_RATIO`, `FLUX_MIN`): lonjakan RMS selisih sampel. Dulu petikan beruntun hilang kalau dengung beberapa nada menumpuk dan volume total tidak naik cukup. Onset tanpa transien dalam `SAME_NOTE_WINDOW_MS` wajib >= `NO_TRANSIENT_MIN_PEAK` (60%) dari puncak terakhir, supaya beating dengung tidak jadi huruf hantu.
- **Verifikasi harmonik** (`HARMONIC_EXPLAINED_MIN`): bacaan retrigger atau < 200 Hz harus punya tenaga di f..4f. Mencegah nada hantu dari campuran dengung (mis. 82,4 Hz x 6 = B4 terbaca angka "1").
- **Petikan ulang nada SAMA (mis. "ll", "aa") tidak lagi sering hilang**: pada bacaan tail bersih >= 225 Hz dengan transien, syarat keras dilonggarkan ke `ECHO_SAME_NOTE_PEAK_TRANSIENT` (30%) dan gerbang lembah dilewati (volume hop bergantung fase saat nada sama bertumpuk dengan dengungnya). Nada < 225 Hz (angka, q-p) SENGAJA tetap memakai gerbang lama yang ketat, karena tidak ada pembeda volume/energi yang bersih antara petikan ulang sah dan hantu dari dengung (diukur; lihat skenario `echoh`).

Hasil simulasi (asli v1.3.5 -> v1.3.6), tanpa dan dengan HP lambat (`cost=8`):
| Skenario | v1.3.5 | v1.3.6 |
|---|---|---|
| `rapid` (7 nada tiap 220 ms) | 5/7 benar, 1 dobel | 7/7 benar, 0 dobel |
| `repeat` (76 diulang tiap 250 ms) | 4 dari 6 terketik | 6 dari 6 |
| `rep 0.3 76`, `rep 0.25 60`, `rep 0.3 64` | 3-5 dari 6 | 6 dari 6 |
| Petikan tunggal, dengung panjang + AGC, tuts fungsi, gema harmonik (`echoh`), profil harmonik | benar | identik (tidak ada regresi) |

**Batas yang masih ada** (jujur): (1) nada rendah < 225 Hz yang diulang cepat masih bisa hilang (`rep 0.4 45`: 4 dari 6); (2) lari nada cepat < ~300 ms saat 3+ senar sebelumnya masih berdengung (`seq 0.25`/`seq 0.3`): pelacak pitch monofonik tidak bisa memisahkan campuran itu, hasilnya nada hilang (bukan salah huruf). Redam senar sebelumnya (palm-mute) kalau mau lebih cepat; (3) suara orang masih bocor jadi huruf (`voice`), sama seperti v1.3.5. Semua angka di atas SIMULASI sinyal sintetis, bukan gitar/HP asli.

## Yang berubah di v1.3.5 (perbaikan lambat / telat)
- **APK debug sekarang benar-benar non-debuggable.** `native-patches/insert_perf.py` sudah ada sejak lama tapi TIDAK pernah dipanggil workflow, jadi APK debug berjalan sebagai *debuggable*: ART mematikan optimasi dan loop YIN di thread audio jauh lebih lambat. Langkahnya kini ada di `android-build.yml`.
- **`.github/workflows/` disamakan dengan `workflows/` (versi baru).** Salinan di `.github/` ternyata versi lama (tanpa `permissions: contents: write` sehingga Release bisa gagal 403, tanpa ikon/nama APK Guitarwiter, tanpa cek password keystore PKCS12).
- **YIN dihitung lazy** (`yinCore`): CMNDF dihitung bertahap dan berhenti begitu lembah pertama ketemu. Hasil identik bit-per-bit dengan versi lama (diuji 600 sinyal), tapi nada tinggi ~6,8x lebih ringan (2,98 -> 0,44 ms/bacaan di mesin uji) dan nada rendah ~1,3-2x. Bacaan yang lebih singkat dari 1 hop (16,7 ms) mencegah loop deteksi tertinggal dari audio di HP lambat.
- **Jam deteksi monoton** (`System.nanoTime`) menggantikan `currentTimeMillis`. Jam dinding yang melompat mundur (sinkron waktu otomatis) membuat `cooldownUntil`/`touchMuteUntil` "di masa depan" sehingga mic seolah mati sementara.
- **IPC sinkron ke aplikasi tujuan ditunda saat mengetik** (`HtmlKeyboardService`): `getCursorCapsMode()` (50 ms) dan `getTextBeforeCursor()` (120 ms) dulu jalan sesudah SETIAP huruf di main thread yang sama yang mengetik huruf berikutnya; kalau WhatsApp/Instagram sedang sibuk, huruf berikutnya telat. Sekarang dijalankan sekali, 300 ms sesudah berhenti mengetik (`TYPING_ACTIVE_MS`, `IDLE_SYNC_DELAY_MS`).
- **`deaccent()` di-cache** (`index.html`): dipanggil untuk setiap kata kamus pribadi pada setiap huruf (2x) di thread JS; kini satu lookup Map.
- **Mic mencoba start lagi** (4x: 250/600/1200/2500 ms) kalau `startNativeMic()` gagal sesaat (mis. keyboard cepat disembunyikan lalu ditampilkan), dan menampilkan pesan kalau tetap gagal. Dulu gagal diam-diam sampai mic dinyalakan ulang manual.
- `tools/sim/run.sh` jalan juga di JDK tanpa `javac` terpisah.

## Yang berubah di v1.3.4
- **Deteksi dikembalikan ke mesin bersih v1.1.3**, tanpa filter "Gitar saja" berbasis ambang volume mutlak (`G_MIN_PEAK`, `G_FAST_MIN_PEAK`, `G_SUSTAIN`, dsb. dari v1.3.x). Ambang volume itu tebakan dan di HP dengan gain mic berbeda bisa membuang atau menunda petikan sungguhan. Konsekuensinya: **suara orang/TV tidak lagi disaring khusus**.
- **Tuts fungsi diamankan** (lihat `FUNCTIONAL_KEYS_STRICT`, `OVERTONE_*`, `HARMONIC_ECHO_*`). Sebelumnya `FUNCTIONAL_KEYS_STRICT=false` sehingga satu bacaan salah sudah cukup untuk mengubah Shift/mode/hapus.
- **Shift lewat nada tidak pernah mengunci CapsLock.** Dua deteksi A4 berdekatan (gema/dengung) dulu terbaca "ketuk dua kali" sehingga CapsLock menyala sendiri dan huruf jadi kapital. CapsLock sekarang hanya lewat sentuhan (ketuk Shift dua kali).
- **Peta nada Java tidak dipakai saat basi.** Sesudah nada yang diproses JS (mis. `?123` pindah ke simbol), Java menunggu peta baru dulu, jadi huruf berikutnya tidak diketik dengan peta mode lama lalu dihapus-ketik-ulang.
- Dipertahankan dari v1.3.x: bunyi & getar tuts native (`keyTap`), bungkam mic saat sentuhan, gerbang anti-gema, urutan ketik-dulu.

## Masalah umum
- **Satu petikan muncul dua kali** → naikkan `ECHO_SAME_NOTE_PEAK` (mis. 0.8) / `ECHO_WINDOW_MS`. Kalau petikan ulang cepat pada nada yang sama malah tidak muncul, turunkan (mis. 0.55).
- **Nada tinggi (x c v b n m) masih dobel** → naikkan `SAME_NOTE_VALLEY_RATIO` (mis. 2.2) atau `SAME_NOTE_WINDOW_MS` (mis. 1800). Nyalakan "Info nada": muncul "↩ gema diabaikan" tiap kali gerbang membuang sesuatu.
- **Shift/Hapus/`?123`/Enter terasa lambat atau susah keluar** → memang butuh 3 bacaan (±90-100 ms). Longgarkan: `FUNCTIONAL_KEYS_STRICT = false` (kembali ke perilaku lama, lebih mudah salah picu).
- **Tuts fungsi sengaja dipetik tapi ditolak** → cek "Info nada" ("↩ gema diabaikan"); kalau itu overtone-veto yang terlalu galak, naikkan `OVERTONE_VETO_RATIO`.
- **Huruf hantu saat mengetik dengan jari** → naikkan `TOUCH_MUTE_MS` (mis. 300).
- **Huruf berulang (`eeee`) atau muncul sendiri** → sensitivitas terlalu tinggi / derau ruangan; naikkan `ONSET_RMS`.
- **Nada tertukar huruf ↔ angka** → salah oktaf pada nada rendah; lihat `LOW_ZONE_*`.
- **Terasa delay** → lihat angka `· xx ms` di status keyboard (waktu di dalam kode). Sisanya adalah latensi audio masuk Android (`AudioRecord`) yang tidak bisa dipangkas dari Java.
- **Mode tiba-tiba pindah ke simbol/emoji** → set `PITCH_MODE_TOGGLE_KEYS = false`.

Kebijakan privasi: [privacy-policy.md](privacy-policy.md)

## Bunyi & getar tuts
- Setiap sentuhan tuts memanggil SATU fungsi native `keyTap(kind, getar, bunyi, volume)`: bungkam mic + bunyi tuts + getar. Bunyi memakai efek bawaan Android (`AudioManager.playSoundEffect`) seperti Gboard: beda untuk huruf, spasi, hapus, enter, dan mengikuti pengaturan "Suara sentuh" sistem.
- Teks selalu dikirim ke aplikasi lebih dulu, bunyi/getar menyusul.
- Nyalakan di Setelan keyboard: "Suara klik" dan "Getaran keyboard". Kalau tetap senyap, cek Setelan Android > Suara > "Suara sentuh".

## Pengujian (folder `tools/`)
Dijalankan di sini sebelum rilis; tidak ikut ke APK.
- `tools/flow-test.js` (Node + `npm i jsdom`): menjalankan `www/index.html` di browser tiruan; memeriksa label ↔ nada ↔ karakter yang diketik untuk SEMUA tuts di mode huruf/Shift/Caps/simbol 1/simbol 2, alur ketik dari Java, perilaku Shift/CapsLock dari nada vs sentuhan, dan pindah mode `?123`.
- `tools/vsim/` (JDK 17): sama dengan `tools/sim/` tapi pakai **jam virtual**, jadi hasilnya identik tiap dijalankan dan jauh lebih cepat dari real-time. `cost=<ms>` meniru HP lambat; `DET=<file.java>` membandingkan detektor lain (mis. versi lama); skenario tambahan `rep <gap> <midi> <amp>` (nada sama diulang). Skenario `hl <profil> <midi...> [res=<rasio>]` (v1.3.7): tiap nada dipetik sendiri dengan profil harmonik tertentu dan resonansi badan gitar sintetis (`-Dresf=<Hz>` mengatur frekuensinya, `PER=1` mencetak hasil per nada). Contoh: `tools/vsim/run.sh cost=8 rapid`.
- `tools/sim/` (JDK 17): menjalankan `NativeMicPitchDetector.java` ASLI dengan stub Android dan audio sintetis real-time (petikan, urutan cepat, dengung, AGC, high-pass mic HP, tuts fungsi, gema harmonik, uji unit veto overtone). Lihat `tools/sim/README.txt`. Hasilnya simulasi, bukan gitar/HP asli.
