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
| `FUNCTIONAL_KEYS_STRICT` | `true` = shift/hapus/enter dipersulit (3 bacaan sepakat) |
| `FAST_*` | jalur cepat nada pertama (hanya ≥ 300 Hz, syarat ketat) |
| `LOW_ZONE_*` | nada < 300 Hz menunggu data lebih banyak (mencegah salah oktaf angka↔huruf) |
| `ONSET_RMS`, `RETRIGGER_*`, `COOLDOWN_MS` | sensitivitas petikan; terlalu sensitif = huruf berulang/acak |
| `TOUCH_MUTE_MS` | sesudah tuts disentuh jari, onset mic dibungkam sebentar (getar/klik/ketukan jari tidak jadi huruf hantu) |
| `ECHO_WINDOW_MS`, `ECHO_SAME_NOTE_PEAK`, `ECHO_OTHER_NOTE_PEAK` | gerbang anti-gema: petikan baru dalam jendela ini harus cukup keras dibanding petikan sebelumnya, kalau tidak dianggap dengungan & diabaikan |
| `SAME_NOTE_WINDOW_MS`, `SAME_NOTE_VALLEY_RATIO` | nada SAMA dalam jendela panjang harus didahului lembah beneran (puncak >= 1.8x level terpelan sejak komit terakhir). Menangkap sisa ring senar tipis (nada tinggi x c v b n m) yang naik lagi belakangan |
| `guitarLevel` (konstanta di `NativeMicPitchDetector.java`, dikunci 2 = ketat; ganti ke 1 = longgar & lebih cepat) | filter "Gitar saja", SELALU aktif tanpa tombol. Nada yang dibuang: terlalu pelan (`G_MIN_PEAK_*`), nadanya meliuk seperti vokal (`G_WOBBLE_*`), atau levelnya datar/terus naik tanpa meluruh seperti vokal & dengung (`G_SUSTAIN_*`, `G_RISING_AGE_MS`). Level 2 mematikan jalur cepat dan menunggu minimal 3 bacaan valid (±80 ms); nada yang bergeser lebih dari `G_SPREAD_L2` sen antar bacaan dibuang (suara orang jarang diam di satu nada). Hanya berlaku di mic native (APK). |
| `G_ABRUPT_RATIO`, `G_FAST_MIN_PEAK`, `G_FAST_MIN_PROB`, `G_FAST_MAX_CENTS`, `G_MIN_READS_ABRUPT` | **jalur cepat bersyarat** (membaca HANYA hop terbaru ±800 sampel dengan satu pass YIN, bukan jendela 4096; terukur ±40 ms di simulasi) (respons mendekati ketikan Gboard): kalau awalan bunyi "tiba-tiba" (level hop kedua <= 1.12x hop pemicu, ciri petikan senar), keras (>= 0.05) dan nadanya bersih (prob >= 0.92, < 10 sen dari pusat), nada >= 300 Hz langsung diketik ±25 ms. Nada rendah dengan awalan tiba-tiba cukup 2 bacaan, sisanya 3 bacaan. Bunyi yang tidak memenuhi syarat tetap lewat jalur ketat (filter suara tidak longgar) |
| `G_SHARP_RATIO` (6.0) | **(v1.3.2)** awalan "tiba-tiba" kini dinilai dari ketajaman lonjakan di hop pemicu (rms pemicu >= ratio x hop sebelumnya), bukan dari fase petikan terhadap batas hop (dulu hanya ~20% petikan lolos jalur cepat). Suara orang bocor? naikkan ke 8-10. Kurang responsif? turunkan ke 4 |
| `G_ABRUPT_MAX_DECAY` (0.95) | jalur "2 bacaan" hanya untuk bunyi yang sudah meluruh dari puncak; bunyi datar (suara ditahan) harus 3 bacaan |
| `LOW_ZONE_MIN_AGE_MS` (50) / `LOW_ZONE_FAST_AGE_MS` (33) | **(v1.3.2)** dulu 66 / 50. Kalau angka/huruf q-p tertukar oktaf, kembalikan ke 66 / 50 |
| `REJECT_RELEASE_WAIT_MS` (250) | kunci singkat sesudah bunyi dibuang filter gitar (dulu 1,5 dtk) supaya petikan sungguhan sesudahnya tidak ikut terkunci. Petikan yang menimpa dengung nada lama tidak dinilai meliuk/datar (bacaannya memang bercampur) |
| `RELEASE_RMS` (0.009) | sengaja di bawah `ONSET_RMS` (0.012): hysteresis supaya riak ring di sekitar ambang tidak melepas kunci lalu dibaca petikan baru |

## Masalah umum
- **Satu petikan muncul dua kali** → naikkan `ECHO_SAME_NOTE_PEAK` (mis. 0.8) / `ECHO_WINDOW_MS`. Kalau petikan ulang cepat pada nada yang sama malah tidak muncul, turunkan (mis. 0.55).
- **Nada tinggi (x c v b n m) masih dobel** → naikkan `SAME_NOTE_VALLEY_RATIO` (mis. 2.2) atau `SAME_NOTE_WINDOW_MS` (mis. 1800). Nyalakan "Info nada": muncul "↩ gema diabaikan" tiap kali gerbang membuang sesuatu. Kalau petikan ulang cepat di nada yang sama malah hilang, turunkan rasio ke 1.5.
- **Petikan gitar ikut terbuang (terutama gitar listrik berdistorsi/sustain panjang)** → set `guitarLevel = 1`, atau naikkan `G_SPREAD_L2` (mis. 30) / turunkan `G_MIN_PEAK_L2`. Nyalakan "Info nada": "🎸 bukan gitar diabaikan (alasan)" memberi tahu kenapa.
- **Terasa kurang responsif** → longgarkan jalur cepat: `G_ABRUPT_RATIO` 1.25, `G_FAST_MIN_PEAK` 0.035. Kalau suara mulai lolos lagi, kembalikan.
- **Suara orang / TV masih lolos** → perkecil `G_SPREAD_L2` (mis. 15) atau naikkan `G_MIN_PEAK_L2` (mis. 0.03) supaya hanya bunyi yang dekat mic dan keras yang masuk.
- **Huruf hantu saat mengetik dengan jari** → naikkan `TOUCH_MUTE_MS` (mis. 300).
- **Huruf berulang (`eeee`) atau muncul sendiri** → sensitivitas terlalu tinggi / derau ruangan; naikkan `ONSET_RMS`.
- **Nada tertukar huruf ↔ angka** → salah oktaf pada nada rendah; lihat `LOW_ZONE_*`.
- **Terasa delay** → lihat angka `· xx ms` di status keyboard (waktu di dalam kode). Sisanya adalah latensi audio masuk Android (`AudioRecord`) yang tidak bisa dipangkas dari Java.
- **Mode tiba-tiba pindah ke simbol/emoji** → set `PITCH_MODE_TOGGLE_KEYS = false`.

Kebijakan privasi: [privacy-policy.md](privacy-policy.md)

## Bunyi & getar tuts (v1.3.0)
- Setiap sentuhan tuts memanggil SATU fungsi native `keyTap(kind, getar, bunyi, volume)`: bungkam mic + bunyi tuts + getar. Bunyi memakai efek bawaan Android (`AudioManager.playSoundEffect`) seperti Gboard: beda untuk huruf, spasi, hapus, enter, dan mengikuti pengaturan "Suara sentuh" sistem.
- Teks selalu dikirim ke aplikasi lebih dulu, bunyi/getar menyusul.
- Nyalakan di Setelan keyboard: "Suara klik" dan "Getaran keyboard". Kalau tetap senyap, cek Setelan Android > Suara > "Suara sentuh".

## Responsivitas (v1.3.2)
Terukur di simulasi petikan sintetis (waktu dari petikan sampai huruf, di dalam kode saja): rata-rata ~75 ms -> ~49 ms; nada tinggi ~63 -> ~28 ms; huruf a-l ~63 -> ~39 ms. Akurasi di simulasi sama. YIN dihitung bertahap (berhenti di nada pertama yang ketemu): hasil identik, biaya per bacaan ~2x lebih ringan. Belum diuji di gitar/HP asli; latensi `AudioRecord` Android tidak termasuk.
