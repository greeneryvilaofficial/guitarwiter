# Meta Llama 3.2 1B Instruct di HP (offline) — status & langkah menyambungkan

## Status jujur (v1.6.0)
| Bagian | Status |
|---|---|
| `src/lib/offline/llama.js` (adaptor JS, templat chat Llama 3, timeout, status) | ✅ selesai, diuji dengan jembatan palsu |
| `native-patches/LlamaBridge.java` (`window.AndroidLlama`) | ✅ selesai, dikompilasi & dijalankan dengan stub Android; melapor `nativeLib:false` bila pustaka tak ada |
| `libgwllama.so` (JNI di atas **llama.cpp**) | ❌ **belum ada** — harus dikompilasi dengan Android NDK |
| Model `.gguf` | ❌ **tidak dibundel** (≈0,8 GB) — dipasang manual di HP |
| Uji di perangkat nyata (kecepatan, memori, kualitas) | ❌ belum dilakukan |

Sampai dua ❌ pertama terpasang, panel Terjemah menampilkan "Llama offline: belum siap — …" dan memakai kamus offline. Jangan menulis "Llama berjalan offline" di README/video sebelum langkah di bawah lulus.

## Langkah
1. **Model.** Unduh Llama 3.2 1B Instruct dalam format GGUF (kuantisasi Q4_K_M cukup). Model ini bergerbang lisensi Meta — baca dan setujui *Llama 3.2 Community License* di sumber resminya. Salin ke HP:
   ```bash
   adb push Llama-3.2-1B-Instruct-Q4_K_M.gguf /sdcard/Android/data/com.keyboardkustom.app/files/models/
   ```
   (Cukup satu berkas `*.gguf` di folder itu.)
2. **JNI.** Tambahkan `android/app/src/main/cpp/` dengan `CMakeLists.txt` yang membangun `llama.cpp` dan satu pustaka bersama bernama **`gwllama`**. Titik masuk yang dicari Java:
   ```
   JNIEXPORT jstring JNICALL Java_com_keyboardkustom_app_LlamaBridge_nativeGenerate(JNIEnv*, jclass, jstring modelPath, jstring prompt, jint maxTokens)
   ```
   Kontraknya: muat model (cache antar panggilan), tokenisasi `prompt` dengan `add_special=true` (BOS ditambahkan di sini; templat JS sengaja tanpa `<|begin_of_text|>`), sampling greedy/`temperature≈0`, berhenti di `<|eot_id|>` atau `maxTokens`, kembalikan teks jawaban saja. Titik awal yang baik: contoh Android resmi di repo `llama.cpp` (`examples/llama.android`). API `llama.cpp` sering berubah — ikuti versi yang kamu pin.
3. **Gradle.** Aktifkan `externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt" } }` dan `ndk { abiFilters "arm64-v8a" }` (lewat skrip patch seperti `insert_*.py`, karena `android/` dibuat ulang oleh Capacitor).
4. **Uji.** Buka panel Terjemah → status harus "Llama siap (… MB)". Pilih mesin **Llama offline**, terjemahkan, pastikan catatan hasil berbunyi "Meta Llama (offline, di perangkat)".
5. **Bukti offline yang bisa diperiksa orang lain:** rekam layar dengan mode pesawat menyala, buka Terjemah, terjemahkan satu kalimat; tampilkan juga pemakaian data aplikasi (Settings → Network → App data usage). Tulis angka yang benar-benar terukur.

## Catatan kualitas & lisensi
- Llama 3.2 tidak mencantumkan Indonesia, Sunda, atau Jawa di daftar bahasa resminya; model 1B akan sering keliru di sana. Untuk Inggris ↔ Indonesia hasilnya lebih masuk akal tetapi tetap bukan setara terjemahan mesin besar.
- Lisensi Llama meminta atribusi (mis. "Built with Llama") bila kamu mendistribusikan model/turunannya. Periksa teks lisensi yang berlaku sebelum merilis APK yang membundel model.
