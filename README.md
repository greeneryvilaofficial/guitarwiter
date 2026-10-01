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

## Masalah umum
- **Huruf berulang (`eeee`) atau muncul sendiri** → sensitivitas terlalu tinggi / derau ruangan; naikkan `ONSET_RMS`.
- **Nada tertukar huruf ↔ angka** → salah oktaf pada nada rendah; lihat `LOW_ZONE_*`.
- **Terasa delay** → lihat angka `· xx ms` di status keyboard (waktu di dalam kode). Sisanya adalah latensi audio masuk Android (`AudioRecord`) yang tidak bisa dipangkas dari Java.
- **Mode tiba-tiba pindah ke simbol/emoji** → set `PITCH_MODE_TOGGLE_KEYS = false`.

Kebijakan privasi: [privacy-policy.md](privacy-policy.md)
