# Cara publish ke GitHub supaya tidak "mandek" (untuk orang & juri)

## 1. Akar repo harus isi folder `com.guitarwiter/`, bukan zip-nya
Zip `GuitarWiter_v1_5_1.zip` punya DUA lapis folder: `GuitarWiter_v1.5.1/com.guitarwiter/…`. Yang boleh menjadi akar repo adalah **isi `com.guitarwiter/`**
(di dalamnya ada `.github/`, `www/`, `src/`, `README.md`, `package.json`). Kalau dua lapis luar ikut ter-upload:
- GitHub Actions **tidak jalan** (hanya membaca `.github/workflows/` di akar) → tidak ada build, tidak ada centang hijau.
- `README.md` tidak tampil di halaman depan → juri melihat daftar folder kosong-makna.

Cek cepat: di halaman depan repo harus langsung terlihat `.github`, `docs`, `src`, `www`, `README.md`.

## 2. Langkah (terminal, dari dalam folder `com.guitarwiter/`)
```bash
git init -b main
git add .
git status            # pastikan TIDAK ada *.keystore, *.gguf, .env, node_modules (sudah dijaga .gitignore)
git commit -m "GuitarWiter v1.6.0"
git remote add origin https://github.com/<akunmu>/<nama-repo>.git
git push -u origin main
```
Lewat web (tanpa git): buat repo kosong → *Add file → Upload files* → seret **isi** `com.guitarwiter/` (bukan foldernya). Folder tersembunyi `.github` sering terlewat saat seret-lepas; lebih aman pakai git.

## 3. Pengaturan repo yang membuat juri tidak tersangkut
1. **Public** (Settings → General → Danger Zone → Change visibility). Repo private = juri melihat 404.
2. **About** (ikon roda gigi di kanan atas): isi deskripsi singkat + topics: `android`, `keyboard`, `guitar`, `llama`, `meta`, `accessibility`.
3. **Settings → Actions → General → Workflow permissions → Read and write permissions** (build memerlukan `contents: write` untuk membuat Release). Tanpa ini step Release gagal 403.
4. **Verify** (`verify.yml`) jalan ±30 detik, tanpa secret → centang hijau cepat di commit terakhir. Build APK (`android-build.yml`) lebih lama (±5–10 menit) dan boleh gagal tanpa menyembunyikan kode; jangan jadikan itu satu-satunya bukti.
5. Setelah build pertama sukses: tab **Releases** berisi `Guitarwiter-debug.apk`. Sematkan (pin) di README satu tautan langsung ke Release terbaru.
6. **LICENSE**: belum ada di repo. Banyak lomba mewajibkan lisensi terbuka. Pilih sendiri (mis. MIT atau Apache-2.0): *Add file → Create new file → `LICENSE` → Choose a license template*.
7. Isi **email kontak** di `privacy-policy.md` (masih `[ISI EMAIL KONTAK KAMU DI SINI]`).

## 4. Jangan sampai ini ikut ter-push
- Keystore / sandi (`KEYSTORE_BASE64`, `KEY_PASSWORD`, …) → hanya di **Settings → Secrets and variables → Actions**.
- Kunci API Meta → tidak ada di kode; pengguna memasukkannya sendiri di panel (disimpan di HP).
- Model `.gguf` (≈0.8 GB) → batas GitHub 100 MB per berkas. Letakkan di HP (lihat `LLAMA_ON_DEVICE.md`) atau sebagai *Release asset* terpisah, plus tulis SHA-256-nya di README.
- Kalau kunci/keystore sempat ter-commit: menghapus berkasnya TIDAK cukup (ada di riwayat). Cabut/ganti kuncinya di sumbernya.

## 5. Daftar periksa 2 menit sebelum mengirim tautan ke juri
- [ ] Buka tautan repo di jendela **incognito** (tanpa login): README tampil, tidak 404.
- [ ] Centang hijau *Verify* di commit terakhir.
- [ ] Tab Releases ada APK, dan APK terpasang di satu HP.
- [ ] README bagian *For judges* menyebut jujur apa yang sudah dan belum jalan (Llama native belum terpasang → tertulis begitu).
- [ ] Tidak ada klaim di README yang tidak bisa didemokan atau diuji dari repo.
- [ ] LICENSE ada, email privasi terisi.
