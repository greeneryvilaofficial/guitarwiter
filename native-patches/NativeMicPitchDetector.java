package com.keyboardkustom.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import androidx.core.content.ContextCompat;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Deteksi nada gitar LANGSUNG lewat AudioRecord (API Android native),
 * BUKAN lewat getUserMedia() di JavaScript/WebView.
 *
 * Kenapa dibuat terpisah dari WebView: getUserMedia() di WebView ternyata
 * selalu gagal (NotAllowedError) di sebagian HP meski izin RECORD_AUDIO
 * sudah "Diizinkan" di level sistem -- kemungkinan pembatasan WebView/OEM
 * yang di luar jangkauan kode. AudioRecord ini cuma butuh izin RECORD_AUDIO
 * biasa (yang sudah terbukti granted), tanpa lewat lapisan WebView sama sekali.
 *
 * Algoritma di bawah ini port dari fungsi yinDetect() + micLoop() di index.html,
 * dan HARUS dijaga tetap sinkron dengan versi JS itu supaya jalur native & jalur
 * WebView terasa sama persis buat user:
 *   - Deteksi pitch pakai algoritma YIN (bukan autokorelasi biasa lagi) --
 *     jauh lebih tahan salah pilih oktaf (mis. F2 kebaca F3) karena guitar
 *     sering punya harmonik ke-2 yang lebih kuat dari nada dasarnya sendiri,
 *     dan autokorelasi polos gampang kejebak kunci ke situ.
 *   - Nada di-commit langsung di bacaan PERTAMA yang meyakinkan (bukan nunggu
 *     beberapa bacaan sepakat dulu) -- YIN cukup andal buat itu, jadi gak
 *     perlu dipetik berkali-kali dulu baru kedeteksi.
 */
public class NativeMicPitchDetector {

    /** Dipanggil di UI thread setiap kali ada hasil dari thread rekaman. */
    public interface Listener {
        void onOnsetDetected();                 // Mulai kedengaran ada petikan
        void onPitchIndex(int idx, double freq); // Nada valid, ketemu indeks tuts-nya
        void onOutOfRange(double freq);          // Nada kedengaran tapi di luar jangkauan tuts
        void onUnclear();                        // Sinyal kedengaran tapi nadanya tidak jelas
        // BARU: sinyal kedengaran KERAS tapi SAMA SEKALI TIDAK PERIODIK (yinDetect
        // gagal total, bukan cuma ambigu di batas kategori) -- ciri khas pukulan/
        // ketukan ke badan gitar (bukan senar dipetik). Beda dari onUnclear(): itu
        // dipakai kalau ADA nada yang terdeteksi tapi cuma ambigu di batas dua
        // kategori tuts, jadi tetap diperlakukan beda (lihat recordLoop()).
        void onPercussiveTap();
    }

    private static final int SAMPLE_RATE = 44100;
    // 4096 sample @44.1kHz ~= 93ms jendela analisis. HARUS sama persis dengan
    // analyser.fftSize di index.html. Dulu 1536 (35ms) biar terasa cepat, tapi
    // itu cuma ~2.8 siklus gelombang buat nada rendah kayak E2 (~82Hz) --
    // ketipisan data bikin YIN (atau autokorelasi apa pun) gampang salah pilih
    // oktaf. 4096 kasih ~7.6 siklus di E2, jauh lebih andal/akurat. Lebar
    // jendela ini TIDAK diturunkan lagi biar akurasi nada rendah tetap terjaga
    // -- kecepatan sekarang didapat dari HOP_SAMPLES di bawah, bukan dari
    // memperkecil jendela ini.
    private static final int BUFFER_SAMPLES = 4096;
    // BARU -- inti dari peningkatan kecepatan: dulu recordLoop() menunggu
    // audioRecord.read() mengisi PENUH 4096 sampel baru (blocking, ~93ms) tiap
    // kali sebelum bisa membaca ulang -- jadi onset & konfirmasi nada paling
    // cepat baru kerasa ~186ms (2 bacaan) sesudah dipetik. Sekarang baca
    // sedikit-sedikit (HOP_SAMPLES per iterasi, ~16.6ms -- SENGAJA disamakan
    // dengan 1/60 detik supaya kecepatan & rasa responsifnya IDENTIK dengan
    // requestAnimationFrame di index.html, ~60fps) dan geser isi "window" ke
    // kiri tiap iterasi (sliding window), lalu tempel sampel baru di ujung.
    // Hasilnya: "window" SELALU berisi 4096 sampel PALING BARU (persis cara
    // AnalyserNode.getFloatTimeDomainData() bekerja di WebView), tapi
    // diperbarui tiap ~16.6ms, bukan tiap ~93ms. Lebar jendela YIN (jadi tetap
    // akurat buat nada rendah) tidak berubah sama sekali -- yang berubah cuma
    // SESERING APA jendela itu "digeser dan dibaca ulang".
    private static final int HOP_SAMPLES = SAMPLE_RATE / 60;
    private static final int BASE_MIDI = 40; // E2 -- HARUS sama persis dengan BASE_MIDI di index.html
    private static final int NOTE_COUNT = 44; // HARUS sama persis dengan NOTE_COUNT di index.html
    // Diturunkan lagi dari 140 -> 70: sesudah RETRIGGER ditambahkan (lihat di
    // bawah), COOLDOWN_MS ini cuma perlu jadi debounce MINIMAL buat mencegah
    // riak/jitter di dalam transien satu petikan yang sama kehitung dobel --
    // bukan lagi penjaga utama jarak antar-nada (itu sekarang tugas
    // RETRIGGER_RATIO + RELEASE_RMS). 70ms jauh di bawah jarak antar-petikan
    // tercepat yang wajar (~150-160ms bahkan di teknik tapping cepat), jadi
    // aman. HARUS sama persis dengan COOLDOWN_MS di index.html.
    private static final long COOLDOWN_MS = 70;
    // PENTING (fix "kedeteksi ganda / dobel ketikan"): dulu, begitu COOLDOWN_MS
    // lewat, mic langsung siap mendeteksi onset baru lagi -- padahal senar
    // gitar yang baru dipetik itu MASIH BERDENGUNG jauh lebih lama, dan
    // dengungan itu bisa naik-turun (beating antar harmonik / getaran
    // simpatik senar lain) sampai kebaca sebagai "petikan baru" -> ketikan
    // dobel dari satu kali petik. Sekarang, sesudah komit, mic WAJIB nunggu
    // RMS-nya turun di bawah RELEASE_RMS dulu (bukan cuma nunggu waktu) baru
    // boleh siap deteksi onset baru lagi. HARUS sama persis dengan
    // RELEASE_RMS & MAX_RELEASE_WAIT_MS di index.html.
    private static final double RELEASE_RMS = 0.012;
    private static final long MAX_RELEASE_WAIT_MS = 1500;
    private static final int MAX_SAMPLE_TRIES = 4; // HARUS sama persis dengan batas percobaan di index.html
    private static final double YIN_THRESHOLD = 0.15; // HARUS sama persis dengan THRESHOLD di index.html
    // Diturunkan dari 0.02 -> 0.012: supaya petikan PELAN (fingerstyle, palm
    // mute, atau jari lemah di senar atas yang tipis) tetap memicu onset,
    // bukan cuma petikan keras. Rasio ONSET_RATIO (perbandingan ke smoothedRms
    // / noise-floor sekitar) tetap jadi penjaga utama supaya noise ruangan
    // yang konstan tidak ikut kepicu -- jadi menurunkan ambang absolut ini
    // aman selama rasionya tetap dijaga. HARUS sama persis dengan ambang RMS
    // onset di micLoop() index.html.
    private static final double ONSET_RMS = 0.012;
    private static final double ONSET_RATIO = 1.6; // HARUS sama persis dengan rasio onset di index.html
    // BARU -- fix "nada cepat/tapping ketimpa dengungan nada sebelumnya jadi
    // gak kepick": dulu selama STATE_RELEASING, mic BUTA total terhadap
    // petikan baru sampai dengungan lama turun di bawah RELEASE_RMS -- masalahnya
    // di teknik tapping/petik cepat (mis. gaya Marcin), nada berikutnya sering
    // menimpa SEBELUM dengungan nada sebelumnya sempat reda, jadi onset barunya
    // hilang sama sekali (bukan salah baca, tapi tidak dianggap ada onset).
    // Sekarang selama RELEASING, tiap hop dibandingkan ke hop SEBELUMNYA
    // (bukan ke smoothedRms jangka panjang, yang sudah kadung naik gara-gara
    // ekor dengungan) -- kalau ada lonjakan tajam relatif terhadap hop
    // sebelumnya DAN levelnya sudah cukup keras buat jadi nada sungguhan
    // (bukan cuma riak kecil di ekor dengungan), langsung dianggap onset baru,
    // tanpa nunggu reda dulu. HARUS sama persis dengan RETRIGGER_RATIO &
    // RETRIGGER_MIN_RMS di index.html.
    private static final double RETRIGGER_RATIO = 1.7;
    private static final double RETRIGGER_MIN_RMS = 0.012;
    // BARU (fix "satu strum/petik kebaca berkali-kali jadi huruf dobel/triple"):
    // dulu retrigger cuma dibandingkan ke SATU hop sebelumnya (prevHopRms).
    // Masalahnya, chord yang di-strum (banyak senar bareng) atau nada yang
    // masih berdengung itu levelnya naik-turun terus (BEATING -- interferensi
    // antar harmonik beberapa senar), jadi gampang banget ada satu hop yang
    // kebetulan lebih pelan dari hop tepat sebelumnya lalu hop sesudahnya naik
    // lagi sedikit -> RETRIGGER_RATIO kelewat gampang terpicu berkali-kali
    // padahal itu bukan petikan baru sama sekali, cuma riak dari petikan yang
    // SAMA. Sekarang retrigger dibandingkan ke titik PALING PELAN dalam
    // RETRIGGER_WINDOW_HOPS hop terakhir (~80ms), bukan cuma satu hop -- jadi
    // harus ada "lembah" beneran dulu sebelum dianggap ada "puncak" (onset)
    // baru, bukan sekadar riak naik-turun kecil dalam tren yang sama.
    private static final int RETRIGGER_WINDOW_HOPS = 5;
    // BARU: jarak minimum MUTLAK antar onset (baik onset normal maupun
    // retrigger) -- jaring pengaman terakhir di luar syarat "lembah dulu" di
    // atas, supaya beating yang sangat cepat sekalipun tidak bisa memicu lebih
    // sering dari ini. 110ms masih jauh di bawah jarak petikan tercepat yang
    // realistis (~150-160ms bahkan di teknik tapping cepat), jadi tidak akan
    // kerasa nge-lag buat permainan sungguhan.
    private static final long MIN_RETRIGGER_GAP_MS = 110;
    // BARU (bagian dari fix yang sama): dulu begitu SATU hop RMS-nya di bawah
    // RELEASE_RMS, langsung dianggap "sudah reda" dan state balik ke IDLE.
    // Padahal riak/beating yang sama di atas juga bisa bikin RMS sempat
    // nyentuh di bawah RELEASE_RMS SEBENTAR padahal senarnya masih jelas-jelas
    // berbunyi -- begitu balik ke IDLE, riak berikutnya yang naik lagi kebaca
    // sebagai onset baru -> huruf dobel lagi (lewat jalur normal, bukan
    // retrigger). Sekarang RMS harus di bawah RELEASE_RMS SELAMA
    // RELEASE_CONFIRM_HOPS hop BERTURUT-TURUT (bukan cuma sekali) baru
    // dianggap benar-benar reda.
    private static final int RELEASE_CONFIRM_HOPS = 3;
    // Diturunkan dari 0.012 -> 0.007, sinkron dengan ONSET_RMS di atas --
    // supaya sinyal pelan yang lolos jadi onset juga tidak langsung ditolak
    // yinDetect() sendiri. HARUS sama persis dengan ambang rms di yinDetect()
    // index.html.
    private static final double YIN_MIN_RMS = 0.007;
    // BARU: tunda sedikit sesudah onset sebelum mulai yinDetect(), biar
    // transien petikan (bunyi "tak" pick menyentuh senar) sempat mereda dan
    // gelombangnya sudah cukup stabil buat diukur -- HARUS sama persis dengan
    // delay "sampleAt = now + 45" di micLoop() index.html. Dulu Java tidak
    // butuh ini karena blocking-read 4096-sampel (~93ms) sudah otomatis
    // "menunda" bacaan pertama; sekarang loop jalan tiap ~16.6ms jadi delay
    // ini harus dibuat eksplisit supaya akurasi tidak turun akibat kecepatan.
    private static final long SETTLE_MS = 45;
    // BARU (fix "tap badan gitar masih kebaca jadi nada lain di atas"): dulu
    // satu-satunya sinyal buat mendeteksi tap adalah yinDetect() BALIKIN NULL
    // TOTAL -- padahal resonansi badan gitar kadang punya periodisitas SEMU
    // yang cukup buat yinDetect() balikin frekuensi "valid" (kebetulan cocok
    // sama salah satu nada, sering di area frekuensi tinggi karena benturan
    // pendek/impulsif rawan memicu YIN mengunci ke periode pendek/frekuensi
    // tinggi secara kebetulan). Pembeda fisik yang jauh lebih andal: SENAR
    // yang dipetik sungguhan bertahan (sustain) puluhan-ratusan ms nyaris di
    // level yang sama, sedangkan pukulan/ketukan ke badan gitar meluruh SANGAT
    // CEPAT (~20-30ms) karena itu respons impuls badan gitar, bukan senar
    // bergetar bebas. Kalau di saat pengukuran RMS-nya sudah anjlok jauh dari
    // puncak awal ketukan, itu ciri tap -- KECUALI probabilitas YIN-nya sampai
    // sangat tinggi (nada pendek/staccato/palm-mute yang sungguhan tetap bisa
    // meluruh cepat tapi periodisitasnya jelas sekali). HARUS sama persis
    // dengan TAP_DECAY_RATIO & STRONG_PROBABILITY di index.html.
    private static final double TAP_DECAY_RATIO = 0.30;
    private static final double STRONG_PROBABILITY = 0.80;

    // Rentang frekuensi yang masuk akal buat dicari (nada gitar yang dipetakan ke
    // tuts + sedikit margin). HARUS sama persis dengan MIN/MAX_VALID_FREQ di index.html.
    private static final double MIN_VALID_FREQ = 440.0 * Math.pow(2, (BASE_MIDI - 3 - 69) / 12.0);
    private static final double MAX_VALID_FREQ = 440.0 * Math.pow(2, (BASE_MIDI + NOTE_COUNT - 1 + 3 - 69) / 12.0);

    private final Context context;
    private final android.os.Handler mainHandler;
    private Listener listener;
    private AudioRecord audioRecord;
    private Thread recordThread;
    private final AtomicBoolean running = new AtomicBoolean(false);
    // BARU -- fix "satu fret satu nada harus akurat": gitar SUNGGUHAN jarang
    // pas 100% di reference A440 -- bisa melenceng beberapa cent (fals dikit,
    // suhu senar berubah, atau memang sengaja distem agak turun). Kalau
    // reference-nya kaku di A440, penyimpangan konsisten sekecil itu bisa bikin
    // fret/nada TERTENTU terus-menerus jatuh ke sisi yang salah dari batas
    // kategori, padahal jarak antar fret (interval)-nya sendiri sudah benar.
    // Field ini menyimpan pergeseran tuning yang dipelajari PELAN-PELAN dari
    // bacaan yang paling meyakinkan (lihat isCategorySafe()), lalu dipakai buat
    // mengoreksi semua pembacaan berikutnya -- jadi kalau gitarnya konsisten
    // sedikit fals ke satu arah, sistem "ikut menyesuaikan" alih-alih terus
    // salah di fret yang sama. Dibatasi ke +-45 cent (kurang dari setengah
    // nada) supaya tidak mungkin nyasar mengoreksi ke nada tetangga yang salah.
    // HARUS sinkron persis dengan calibrationOffsetCents di index.html.
    private volatile double calibrationOffsetCents = 0.0;

    public NativeMicPitchDetector(Context context) {
        this.context = context;
        this.mainHandler = new android.os.Handler(context.getMainLooper());
    }

    public boolean hasPermission() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    public synchronized boolean start(Listener listener) {
        if (running.get()) return true;
        if (!hasPermission()) return false;

        this.listener = listener;

        int minBufSize = AudioRecord.getMinBufferSize(
                SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufSize = Math.max(minBufSize, BUFFER_SAMPLES * 4);

        try {
            audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufSize);
        } catch (SecurityException | IllegalArgumentException e) {
            return false;
        }

        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            audioRecord.release();
            audioRecord = null;
            return false;
        }

        running.set(true);
        audioRecord.startRecording();

        recordThread = new Thread(this::recordLoop, "GuitarWiterMicThread");
        recordThread.setPriority(Thread.MAX_PRIORITY);
        recordThread.start();
        return true;
    }

    public synchronized void stop() {
        running.set(false);
        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (IllegalStateException ignored) {
            }
            audioRecord.release();
            audioRecord = null;
        }
        recordThread = null;
    }

    private void recordLoop() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO);

        final short[] hopRaw = new short[HOP_SAMPLES];
        // Jendela geser (sliding window): SELALU berisi BUFFER_SAMPLES sampel
        // PALING BARU. Tiap iterasi cuma HOP_SAMPLES (~16.6ms) sampel lama yang
        // dibuang dari depan dan HOP_SAMPLES sampel baru ditempel di belakang --
        // bukan menunggu buffer 4096-sampel terisi ulang dari nol tiap kali
        // (itu cara lama yang bikin lambat). Ini identik secara perilaku dengan
        // AnalyserNode.getFloatTimeDomainData() di index.html, yang juga selalu
        // mengembalikan sampel terbaru tanpa peduli kapan terakhir dibaca.
        final float[] window = new float[BUFFER_SAMPLES];

        final int STATE_IDLE = 0, STATE_SAMPLING = 1, STATE_RELEASING = 2;
        int state = STATE_IDLE;
        double smoothedRms = 0.001;
        long cooldownUntil = 0;
        long releaseWaitUntil = 0;
        long sampleAt = 0; // waktu paling cepat boleh mulai yinDetect() sesudah onset -- lihat SETTLE_MS
        int sampleTries = 0;
        // Konsensus multi-bacaan (persis cara tuner "pro" bekerja): sebelum ini,
        // begitu SATU bacaan lolos ambang confidence langsung dikunci -- itu bikin
        // rawan ketuker kalau kebetulan satu bacaan itu meleset. Sekarang minta
        // beberapa bacaan BERTURUT-TURUT yang SEPAKAT (idx sama) dulu baru dikunci.
        // Karena satu hop cuma ~16.6ms, dua bacaan sepakat tetap kelar dalam
        // hitungan puluhan milidetik -- jauh lebih cepat dari versi lama yang
        // butuh 2 blok penuh (~186ms).
        int candidateIdx = -1, candidateCount = 0;
        // BARU: dulu CONFIRM_COUNT tetap (selalu 2) buat semua bacaan. Sekarang
        // adaptif per bacaan -- makin dekat pusat nada (centsOff kecil, artinya
        // fretting-nya bersih/jelas), makin sedikit konfirmasi yang dibutuhkan
        // (bisa langsung 1x buat nada yang sangat jelas, tetap terasa instan).
        // Makin ke pinggir/ambigu, makin banyak bacaan sepakat yang diminta --
        // ini yang bikin "satu fret satu nada" lebih akurat buat teknik yang
        // rawan pitch goyang dikit (vibrato ringan, slide, atau chord yang
        // sedang beating) tanpa bikin nada yang jelas jadi terasa lambat.
        // Dihitung ulang tiap bacaan lewat computeRequiredConfirm() di bawah.

        // Riwayat RMS beberapa hop terakhir (bukan cuma satu) -- dipakai buat cari
        // titik paling pelan (lembah) sebelum retrigger, lihat RETRIGGER_WINDOW_HOPS.
        final double[] recentHopRms = new double[RETRIGGER_WINDOW_HOPS];
        java.util.Arrays.fill(recentHopRms, 0.001);
        int recentHopIdx = 0;
        long lastOnsetAt = 0; // kapan terakhir kali ada onset (normal ATAU retrigger) -- lihat MIN_RETRIGGER_GAP_MS
        int releaseBelowCount = 0; // berapa hop BERTURUT-TURUT rms sudah di bawah RELEASE_RMS -- lihat RELEASE_CONFIRM_HOPS
        double onsetPeakRms = 0.001; // puncak RMS sejak onset -- dipakai hitung seberapa cepat sinyal sudah meluruh (lihat TAP_DECAY_RATIO)

        while (running.get()) {
            int read = audioRecord.read(hopRaw, 0, HOP_SAMPLES);
            if (read <= 0) continue;

            // Geser isi window ke kiri sejauh "read" sampel, lalu tempel sampel
            // baru di ujung -- window sesudah ini berisi BUFFER_SAMPLES sampel
            // paling baru.
            System.arraycopy(window, read, window, 0, BUFFER_SAMPLES - read);
            int writeOffset = BUFFER_SAMPLES - read;
            double sumSq = 0;
            for (int i = 0; i < read; i++) {
                float v = hopRaw[i] / 32768f;
                window[writeOffset + i] = v;
                sumSq += (double) v * v;
            }
            // RMS dihitung cuma dari potongan (hop) yang BARU masuk, bukan dari
            // seluruh window -- supaya onset kedengaran secepat hop-nya sendiri
            // (~16.6ms), bukan tertunda karena dirata-rata sama ~93ms histori
            // lama di window yang sebagian besar masih diam.
            double rms = Math.sqrt(sumSq / read);
            long now = System.currentTimeMillis();

            if (state == STATE_IDLE) {
                if (rms > ONSET_RMS && rms > smoothedRms * ONSET_RATIO && now > cooldownUntil) {
                    state = STATE_SAMPLING;
                    sampleTries = 0;
                    candidateIdx = -1;
                    candidateCount = 0;
                    sampleAt = now + SETTLE_MS;
                    lastOnsetAt = now;
                    onsetPeakRms = rms;
                    postOnset();
                }
            } else if (state == STATE_SAMPLING) {
                // Terus perbarui puncak RMS sejak onset -- puncak sungguhan sering
                // baru tercapai beberapa ms SESUDAH hop yang memicu onset (attack
                // butuh sedikit waktu buat naik penuh), jadi dilacak terus selama
                // fase SAMPLING (baik pas nunggu SETTLE_MS maupun pas benar-benar
                // mengukur), bukan cuma diambil dari satu hop pemicu onset saja.
                if (rms > onsetPeakRms) onsetPeakRms = rms;
                if (now >= sampleAt) {
                    PitchReading r = yinDetect(window, BUFFER_SAMPLES, SAMPLE_RATE);
                    sampleTries++;
                    // Seberapa besar sinyal sudah meluruh dari puncaknya -- lihat
                    // TAP_DECAY_RATIO buat penjelasan lengkap kenapa ini pembeda
                    // tap vs nada sungguhan yang lebih andal daripada cuma
                    // "ada/tidaknya periodisitas".
                    double decayRatio = rms / onsetPeakRms;

                    if (r != null) {
                        int[] idxOut = new int[1];
                        double[] centsOffOut = new double[1];
                        boolean safe = isCategorySafe(r.freq, r.probability, idxOut, centsOffOut);
                        // BARU: walau isCategorySafe() bilang "aman", kalau sinyalnya
                        // sudah meluruh SANGAT cepat (ciri tap) DAN periodisitasnya
                        // tidak sampai sangat meyakinkan, jangan percaya sebagai nada
                        // -- ini yang nangkep kasus "tap kebaca jadi nada lain di atas".
                        // Nada staccato/palm-mute yang SUNGGUHAN tetap lolos selama
                        // probabilitasnya tinggi (>= STRONG_PROBABILITY).
                        boolean looksPercussive = decayRatio < TAP_DECAY_RATIO
                                && r.probability < STRONG_PROBABILITY;
                        if (safe && !looksPercussive) {
                            // Konsensus: cek apakah bacaan kali ini SEPAKAT sama kandidat
                            // sebelumnya (idx sama). Kalau beda, kandidat direset ke bacaan
                            // baru ini (mulai hitung dari 1 lagi) -- daripada asal kunci ke
                            // bacaan pertama yang kebetulan lolos ambang tapi ternyata cuma
                            // sekali muncul (fluktuasi sesaat).
                            if (idxOut[0] == candidateIdx) {
                                candidateCount++;
                            } else {
                                candidateIdx = idxOut[0];
                                candidateCount = 1;
                            }
                            // requiredConfirm ADAPTIF: nada yang bacaannya sangat dekat pusat
                            // (fretting bersih) cukup 1 bacaan, yang agak ke pinggir butuh 2,
                            // yang paling ambigu butuh 3 -- lihat catatan requiredConfirm di
                            // deklarasi candidateIdx/candidateCount di atas.
                            int requiredConfirm = centsOffOut[0] < 12 ? 1 : (centsOffOut[0] < 22 ? 2 : 3);
                            if (candidateCount >= requiredConfirm || sampleTries >= MAX_SAMPLE_TRIES) {
                                // Sudah dapat cukup bacaan berturut yang sepakat (paling
                                // umum), ATAU jatah percobaan sudah habis -- pakai bacaan
                                // TERAKHIR yang lolos ini (lebih baik daripada nyerah total).
                                commit(idxOut[0], r.freq);
                                state = STATE_RELEASING;
                                cooldownUntil = now + COOLDOWN_MS;
                                releaseWaitUntil = now + MAX_RELEASE_WAIT_MS;
                            }
                            // kalau belum cukup konsensus & masih ada jatah percobaan,
                            // lanjut ke hop berikutnya (~16.6ms lagi) buat konfirmasi
                        } else if (looksPercussive) {
                            // Meluruh sangat cepat & periodisitasnya tidak sampai
                            // sangat meyakinkan -- ini tap, bukan nada. Langsung
                            // diputuskan sekarang juga (tidak perlu tunggu
                            // MAX_SAMPLE_TRIES habis dulu), karena tap adalah
                            // gestur sesaat, bukan sesuatu yang perlu dikonfirmasi
                            // berulang seperti nada.
                            postPercussiveTap();
                            state = STATE_RELEASING;
                            cooldownUntil = now + COOLDOWN_MS;
                            releaseWaitUntil = now + MAX_RELEASE_WAIT_MS;
                        } else if (sampleTries < MAX_SAMPLE_TRIES) {
                            // Bacaannya persis di batas dua kategori tuts berbeda (mis. angka
                            // vs huruf/tanda baca) dan belum cukup yakin -- coba baca ulang
                            // dulu daripada asal tebak dan salah kategori.
                        } else {
                            postUnclear();
                            state = STATE_RELEASING;
                            cooldownUntil = now + COOLDOWN_MS;
                            releaseWaitUntil = now + MAX_RELEASE_WAIT_MS;
                        }
                    } else if (sampleTries >= MAX_SAMPLE_TRIES) {
                        // Beberapa hop berturut SAMA SEKALI tidak dapat sinyal periodik
                        // (yinDetect() balikin null terus) walau tadinya cukup keras buat
                        // memicu onset -- ini ciri khas TAP/ketukan ke badan gitar (bukan
                        // senar dipetik, jadi tidak ada nada yang bisa dicocokkan sama
                        // sekali). Diperlakukan beda dari "ambigu di batas kategori" di
                        // atas (yang MASIH dapat nada, cuma raguan pilih tutsnya) --
                        // di sini dianggap sengaja: langsung ketik spasi.
                        postPercussiveTap();
                        state = STATE_RELEASING;
                        cooldownUntil = now + COOLDOWN_MS;
                        releaseWaitUntil = now + MAX_RELEASE_WAIT_MS;
                    }
                    // kalau belum yakin & masih ada jatah percobaan, lanjut ke hop berikutnya
                }
            } else { // STATE_RELEASING
                // Cari titik paling pelan dari RETRIGGER_WINDOW_HOPS hop terakhir --
                // ini "lembah" yang harus benar-benar dilewati dulu sebelum sebuah
                // lonjakan dianggap onset baru, bukan cuma riak/beating dalam
                // petikan yang sama.
                double recentMin = recentHopRms[0];
                for (int i = 1; i < recentHopRms.length; i++) {
                    if (recentHopRms[i] < recentMin) recentMin = recentHopRms[i];
                }

                // BARU: retrigger -- kalau ada lonjakan RMS baru yang jelas (nada
                // baru menimpa ekor dengungan nada sebelumnya) DAN memang ada
                // lembah beneran sebelum lonjakan ini DAN sudah lewat jarak minimum
                // mutlak dari onset terakhir, langsung anggap onset baru, jangan
                // tunggu reda dulu. Tiga syarat ini sengaja dipisah (bukan cuma satu
                // ambang) supaya beating/riak dari SATU strum yang sama tidak
                // kehitung berkali-kali sebagai huruf berbeda-beda.
                if (now > cooldownUntil
                        && now - lastOnsetAt > MIN_RETRIGGER_GAP_MS
                        && rms > RETRIGGER_MIN_RMS
                        && rms > recentMin * RETRIGGER_RATIO) {
                    state = STATE_SAMPLING;
                    sampleTries = 0;
                    candidateIdx = -1;
                    candidateCount = 0;
                    sampleAt = now + SETTLE_MS;
                    lastOnsetAt = now;
                    onsetPeakRms = rms;
                    releaseBelowCount = 0;
                    postOnset();
                } else if (now > cooldownUntil && now > releaseWaitUntil) {
                    // Jaring pengaman: sudah kelamaan nunggu (mis. senar terbuka
                    // dibiarkan berdengung lama) -- paksa balik ke IDLE walau belum
                    // benar-benar hening, daripada macet permanen.
                    state = STATE_IDLE;
                    releaseBelowCount = 0;
                } else if (rms < RELEASE_RMS) {
                    // Baru boleh siap deteksi onset baru lagi (jalur normal) kalau
                    // RMS sudah di bawah RELEASE_RMS SELAMA RELEASE_CONFIRM_HOPS hop
                    // BERTURUT-TURUT -- bukan cuma sekali nyentuh di bawah ambang,
                    // supaya riak sesaat di tengah dengungan yang masih jelas
                    // terdengar tidak dikira "sudah reda".
                    releaseBelowCount++;
                    if (releaseBelowCount >= RELEASE_CONFIRM_HOPS && now > cooldownUntil) {
                        state = STATE_IDLE;
                        releaseBelowCount = 0;
                    }
                } else {
                    releaseBelowCount = 0;
                }
            }

            recentHopRms[recentHopIdx] = rms;
            recentHopIdx = (recentHopIdx + 1) % recentHopRms.length;

            smoothedRms = smoothedRms * 0.85 + rms * 0.15;
        }
    }

    private static double freqToMidi(double freq) {
        return 69 + 12 * (Math.log(freq / 440.0) / Math.log(2));
    }

    private static int freqToIdx(double freq) {
        return (int) Math.round(freqToMidi(freq)) - BASE_MIDI;
    }

    // ---- Perbaikan "ketuker kategori" (angka<->huruf, angka<->tanda baca, dst) ----
    // Nada disusun kromatis berurutan (per setengah nada) dari terendah ke tertinggi:
    // baris angka (idx 0-9), lalu huruf/simbol (idx 10-19,20-28,30-36), tombol
    // fungsi (shift/backspace/toggle/enter), lalu tanda baca (idx 40-42). Karena
    // urutannya kontinu, batas antar kategori (mis. idx 9 ke idx 10) cuma
    // terpisah SATU setengah-nada -- kalau deteksi pitch meleset dikit persis di
    // batas itu, niat angka bisa kebaca sebagai huruf/tanda baca atau sebaliknya.
    // HARUS sinkron persis dengan categoryOfIndex()/isCategorySafe() di index.html.
    private static String categoryOfIndex(int idx) {
        if (idx >= 0 && idx <= 9) return "digit";
        if (idx == 29 || idx == 37 || idx == 38 || idx == 39 || idx == 43) return "functional";
        if (idx >= 40 && idx <= 42) return "punct";
        return "letterOrSymbol";
    }

    /**
     * Cek apakah sebuah bacaan frekuensi cukup AMAN buat langsung dikomit tanpa
     * risiko ketuker ke nada tetangga -- baik ketuker KATEGORI (angka jadi
     * huruf/tanda baca) MAUPUN ketuker nada tetangga SESAMA kategori (mis. G2
     * kebaca F#2, jadinya angka "3" padahal maunya "4"). Kalau bacaannya jelas
     * dekat pusat nada, aman langsung. Kalau posisinya di area pinggir/ambigu
     * antara dua nada tetangga, baru dikomit kalau bacaannya cukup meyakinkan --
     * makin dekat batas kategori berbeda, makin tinggi juga syarat keyakinannya.
     * HARUS sinkron persis dengan isCategorySafe() di index.html.
     * idxOut[0] diisi index hasil pembulatan (dipakai lagi di commit() kalau aman).
     * centsOffOut[0] diisi seberapa jauh (dalam cent, SELALU positif/absolut)
     * bacaan ini dari pusat nada terdekat -- dipakai recordLoop() buat menentukan
     * berapa banyak bacaan berturut yang harus sepakat dulu sebelum dikomit
     * (makin jauh dari pusat, makin banyak yang dibutuhkan -- lihat requiredConfirm).
     */
    private boolean isCategorySafe(double freq, double probability, int[] idxOut, double[] centsOffOut) {
        // Kalibrasi tuning diterapkan di sini: geser midiRaw sebesar offset yang
        // sudah dipelajari, SEBELUM dibulatkan ke fret/nada terdekat.
        double midiOffset = freqToMidi(freq) - BASE_MIDI - calibrationOffsetCents / 100.0;
        int idx = (int) Math.round(midiOffset);
        idxOut[0] = idx;
        if (idx < 0 || idx >= NOTE_COUNT) {
            centsOffOut[0] = 100;
            return false;
        }
        double signedCentsOff = (midiOffset - idx) * 100;
        double centsOff = Math.abs(signedCentsOff);
        centsOffOut[0] = centsOff;

        boolean safe;
        if (centsOff < 25) {
            // BARU: dulu langsung aman TANPA cek probability sama sekali kalau
            // sudah dekat pusat nada -- celahnya, bacaan yang KEBETULAN
            // membulat dekat pusat padahal periodisitasnya sendiri tidak jelas
            // (mis. scratch/noise yang menyerempet ambang) bisa ikut lolos.
            // Sekarang tetap perlu probability minimal (asal-tidak-berisik),
            // walau jauh lebih longgar dibanding kasus di batas kategori.
            safe = probability >= 0.5;
        } else {
            int neighborIdx = idx + (midiOffset >= idx ? 1 : -1);
            boolean differentCategory = !(neighborIdx >= 0 && neighborIdx < NOTE_COUNT
                    && categoryOfIndex(idx).equals(categoryOfIndex(neighborIdx)));
            // Beda kategori (mis. angka/huruf) butuh keyakinan lebih tinggi lagi
            // daripada sekadar ketuker sesama angka, karena akibatnya lebih mengganggu.
            double requiredProbability = differentCategory ? 0.9 : 0.75;
            safe = probability >= requiredProbability;
        }

        // BARU -- kalibrasi tuning: kalau bacaan ini SANGAT dekat pusat nada
        // (<15 cent, lebih ketat dari ambang "aman" biasa di atas, biar yang
        // dipelajari cuma bacaan yang benar-benar jelas, bukan yang masih
        // ambigu) DAN memang dianggap aman, pelan-pelan geser referensi tuning
        // ke arah situ (EMA lambat, cuma 5% per bacaan -- perlu puluhan
        // petikan buat konvergen penuh, jadi tidak akan "kebawa" cuma gara-gara
        // satu-dua bacaan aneh). Dibatasi +-45 cent supaya tidak pernah nyasar
        // mengoreksi ke nada tetangga.
        if (safe && centsOff < 15) {
            calibrationOffsetCents = calibrationOffsetCents * 0.95 + signedCentsOff * 0.05;
            if (calibrationOffsetCents > 45) calibrationOffsetCents = 45;
            if (calibrationOffsetCents < -45) calibrationOffsetCents = -45;
        }

        return safe;
    }

    private void commit(int idx, double freq) {
        if (idx >= 0 && idx < NOTE_COUNT) {
            postPitchIndex(idx, freq);
        } else {
            postOutOfRange(freq);
        }
    }

    /** Hasil satu bacaan yinDetect(): frekuensi + seberapa yakin/periodik sinyalnya. */
    private static final class PitchReading {
        final double freq;
        final double probability;
        PitchReading(double freq, double probability) {
            this.freq = freq;
            this.probability = probability;
        }
    }

    /**
     * Port dari fungsi yinDetect(buf, sampleRate) di index.html -- algoritma YIN
     * (De Cheveigne & Kawahara, 2002), dipakai juga di tuner-tuner gitar
     * profesional. Bedanya sama autokorelasi biasa: YIN pakai "cumulative mean
     * normalized difference function" yang jauh lebih tahan salah pilih oktaf
     * (mis. F2 kebaca F3 karena harmonik ke-2 gitar sering lebih kuat dari nada
     * dasarnya sendiri -- autokorelasi polos gampang kejebak di situ).
     * Pencarian dibatasi ke rentang frekuensi nada gitar (MIN/MAX_VALID_FREQ)
     * biar lebih cepat DAN lebih tegas (gak pernah mempertimbangkan periode
     * yang jelas di luar jangkauan gitar).
     */
    private static PitchReading yinDetect(float[] buf, int size, int sampleRate) {
        double rms = 0;
        for (int i = 0; i < size; i++) rms += (double) buf[i] * buf[i];
        rms = Math.sqrt(rms / size);
        if (rms < YIN_MIN_RMS) return null;

        int minTau = Math.max(2, (int) Math.floor(sampleRate / MAX_VALID_FREQ));
        int maxTau = Math.min(size / 2 - 1, (int) Math.ceil(sampleRate / MIN_VALID_FREQ));
        if (maxTau <= minTau) return null;

        // Langkah 1: fungsi selisih d(tau), cuma dihitung untuk rentang tau yang relevan.
        double[] diff = new double[maxTau + 1];
        for (int tau = minTau; tau <= maxTau; tau++) {
            double sum = 0;
            for (int j = 0; j < size - maxTau; j++) {
                double d = buf[j] - buf[j + tau];
                sum += d * d;
            }
            diff[tau] = sum;
        }

        // Langkah 2: cumulative mean normalized difference function (CMNDF).
        double[] cmnd = new double[maxTau + 1];
        double runningSum = 0;
        cmnd[minTau] = 1;
        for (int tau = minTau + 1; tau <= maxTau; tau++) {
            runningSum += diff[tau];
            cmnd[tau] = diff[tau] * (tau - minTau) / (runningSum != 0 ? runningSum : 1e-9);
        }

        // Langkah 3: cari tau TERKECIL (frekuensi tertinggi valid) yang CMNDF-nya
        // sudah di bawah ambang -- ini yang bikin YIN menghindari salah pilih
        // oktaf ke bawah (keliru mengunci ke 2x periode/setengah frekuensi asli).
        int tauEstimate = -1;
        for (int tau = minTau + 1; tau <= maxTau; tau++) {
            if (cmnd[tau] < YIN_THRESHOLD) {
                while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
                tauEstimate = tau;
                break;
            }
        }
        if (tauEstimate == -1) return null;

        // Langkah 3b: koreksi oktaf -- DIHAPUS TOTAL (lihat Langkah 5 di bawah
        // untuk pendekatan penggantinya). Tiga percobaan berturut-turut memperbaiki
        // heuristik "cek subharmonik di 2x tau" (bandingkan nilai CMNDF antar
        // kandidat oktaf) semuanya gagal -- gelombang petikan gitar asli sering
        // tidak simetris sempurna per periode, jadi CMNDF di frekuensi fundamental
        // yang BENAR bisa saja terlihat lebih "kotor" dibanding di salah satu
        // oktafnya, padahal fundamental itu yang benar. Diganti total di Langkah 5
        // dengan verifikasi energi spektral LANGSUNG, bukan re-membandingkan CMNDF.

        // Langkah 4: interpolasi parabola di sekitar tauEstimate biar presisi.
        int x0 = tauEstimate > minTau ? tauEstimate - 1 : tauEstimate;
        int x2 = tauEstimate < maxTau ? tauEstimate + 1 : tauEstimate;
        double betterTau = tauEstimate;
        if (x0 != tauEstimate && x2 != tauEstimate) {
            double s0 = cmnd[x0], s1 = cmnd[tauEstimate], s2 = cmnd[x2];
            double denom = 2 * (2 * s1 - s2 - s0);
            if (denom != 0) betterTau = tauEstimate + (s2 - s0) / denom;
        }
        if (betterTau <= 0) return null;

        double rawFreq = sampleRate / betterTau;
        double probability = 1 - cmnd[tauEstimate];

        // Langkah 5: verifikasi oktaf lewat ENERGI SPEKTRAL LANGSUNG (algoritma
        // Goertzel -- cara ringan mengukur energi di satu frekuensi spesifik
        // tanpa perlu FFT penuh). Idenya: cek betulan apakah ADA energi nyata di
        // frekuensi hasil YIN itu sendiri, dibanding di setengah/dua kali
        // frekuensinya -- bukan cuma re-tebak dari bentuk CMNDF.
        //   - Kalau energi di SETENGAH frekuensi (satu oktaf di bawah) sudah
        //     sebanding dengan energi di frekuensi hasil YIN, itu tanda kuat
        //     "fundamental hilang/lemah" -- hasil YIN cuma harmonik ke-2 dari
        //     fundamental yang sebenarnya satu oktaf di bawah (kasus F2/F3).
        //   - Sebaliknya, kalau energi LANGSUNG di frekuensi hasil YIN itu
        //     sendiri sangat lemah dibanding di DUA KALI frekuensinya, hasil YIN
        //     kemungkinan cuma subharmonik semu (dampak trivial "periodik juga
        //     di 2x periode"), dan fundamental aslinya ada satu oktaf di ATAS
        //     (kasus G#3/A2). HARUS sinkron dengan yinDetect() di index.html.
        double finalFreq = rawFreq;
        double magAtFreq = goertzelMag(buf, size, rawFreq, sampleRate);
        double halfFreq = rawFreq / 2;
        if (halfFreq >= MIN_VALID_FREQ) {
            double magAtHalf = goertzelMag(buf, size, halfFreq, sampleRate);
            if (magAtHalf >= magAtFreq * 0.6) {
                finalFreq = halfFreq;
            }
        }
        // Arah "naik" (kalau energi di rawFreq lemah dibanding di 2x-nya, berarti
        // aslinya satu oktaf lebih tinggi -- buat kasus G#3/A2) DIHAPUS lagi di
        // sini. Senar BAWAH gitar (mis. E2) itu wajar punya harmonik ke-2 yang
        // kuat (apalagi lewat mic HP yang respons rendahnya lemah), jadi ciri
        // "energi di 2x jauh lebih kuat dari fundamentalnya" itu SERING muncul
        // juga untuk nada rendah yang sebenarnya sudah benar -- bukan cuma buat
        // kasus subharmonik semu. Akibatnya E2 yang tadinya benar malah ikut
        // dikoreksi naik jadi E3. Arah "turun" (halfFreq di atas) TIDAK kena
        // masalah yang sama dan sudah teruji aman untuk kasus F2/F3. HARUS
        // sinkron dengan yinDetect() di index.html.

        return new PitchReading(finalFreq, probability);
    }

    /**
     * Algoritma Goertzel: hitung magnitudo energi sinyal di SATU frekuensi
     * target tertentu, tanpa perlu hitung FFT penuh atas semua frekuensi.
     * Dipakai di Langkah 5 yinDetect() buat verifikasi oktaf lewat energi
     * spektral langsung. HARUS sinkron dengan versi goertzelMag() di index.html.
     */
    private static double goertzelMag(float[] buf, int size, double targetFreq, int sampleRate) {
        int k = (int) Math.round(size * targetFreq / sampleRate);
        double w = 2 * Math.PI * k / size;
        double cosine = Math.cos(w), sine = Math.sin(w), coeff = 2 * cosine;
        double q0 = 0, q1 = 0, q2 = 0;
        for (int n = 0; n < size; n++) {
            q0 = coeff * q1 - q2 + buf[n];
            q2 = q1;
            q1 = q0;
        }
        double real = q1 - q2 * cosine;
        double imag = q2 * sine;
        return Math.sqrt(real * real + imag * imag) / size;
    }

    private void postOnset() {
        if (listener == null) return;
        mainHandler.post(() -> { if (listener != null) listener.onOnsetDetected(); });
    }
    private void postPitchIndex(int idx, double freq) {
        if (listener == null) return;
        mainHandler.post(() -> { if (listener != null) listener.onPitchIndex(idx, freq); });
    }
    private void postOutOfRange(double freq) {
        if (listener == null) return;
        mainHandler.post(() -> { if (listener != null) listener.onOutOfRange(freq); });
    }
    private void postUnclear() {
        if (listener == null) return;
        mainHandler.post(() -> { if (listener != null) listener.onUnclear(); });
    }
    private void postPercussiveTap() {
        if (listener == null) return;
        mainHandler.post(() -> { if (listener != null) listener.onPercussiveTap(); });
    }
}
