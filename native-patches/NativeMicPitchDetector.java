package com.keyboardkustom.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Message;
import android.os.Process;
import android.os.SystemClock;

import androidx.core.content.ContextCompat;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Deteksi nada gitar langsung lewat {@link AudioRecord} (native), bukan getUserMedia() di WebView
 * yang gagal (NotAllowedError) di sebagian HP walau izin RECORD_AUDIO sudah diberikan.
 *
 * <p>Perilaku HARUS tetap sinkron dengan micLoop()/yinDetect() di index.html. Semua konstanta
 * bertanda "sinkron dengan index.html" tidak boleh diubah sepihak.</p>
 *
 * <p>Cara kerja: thread rekaman membaca potongan kecil (hop, 1/60 detik) lalu menggeser jendela
 * analisis 4096 sampel. Mesin status IDLE -> SAMPLING -> RELEASING:
 * IDLE menunggu onset (petikan), SAMPLING mengukur nada (jalur cepat, lalu bacaan normal dengan
 * konsensus), RELEASING menunggu dengungan reda atau petikan baru (retrigger).</p>
 */
public class NativeMicPitchDetector {

    /** Dipanggil di UI thread untuk setiap hasil dari thread rekaman. */
    public interface Listener {
        /** Mulai kedengaran ada petikan. */
        void onOnsetDetected();

        /** Nada valid; idx = indeks tuts, freq = frekuensi terukur. */
        void onPitchIndex(int idx, double freq);

        /** Nada terdengar tapi di luar jangkauan tuts. */
        void onOutOfRange(double freq);

        /** Sinyal terdengar tapi nadanya tidak jelas. */
        void onUnclear();

        /** Kick drum sungguhan (hanya jika mode kick aktif, lihat {@link #KICK_FEATURE}). */
        void onKick();

        /** Bunyi non-nada yang bukan kick (ngomong, tepuk tangan, ketukan badan gitar). Tidak boleh mengetik. */
        void onNonTonalIgnored();
    }

    // ---- Fitur yang bisa dinyalakan/dimatikan ----

    /** false = bunyi non-nada (kick/tap) selalu diabaikan, tidak pernah jadi spasi. */
    private static final boolean KICK_FEATURE = false;
    /** true = ?123 / emoji bisa dipicu dari nada. false = hanya lewat sentuhan (mencegah salah-picu mode). */
    private static final boolean PITCH_MODE_TOGGLE_KEYS = true;
    /** true = tuts fungsi (shift/hapus/enter) dipersulit: 3 bacaan sepakat dan tidak dipaksa komit. */
    private static final boolean FUNCTIONAL_KEYS_STRICT = false;

    // ---- Peta tuts (sinkron dengan index.html) ----

    private static final int BASE_MIDI = 40;   // E2
    private static final int NOTE_COUNT = 44;
    private static final int IDX_LAST_DIGIT = 9;
    private static final int IDX_SHIFT = 29;
    private static final int IDX_BACKSPACE = 37;
    private static final int IDX_SYMBOLS = 38;   // ?123
    private static final int IDX_COMMA = 39;
    private static final int IDX_EMOJI = 40;
    private static final int IDX_SPACE = 41;
    private static final int IDX_PERIOD = 42;
    private static final int IDX_ENTER = 43;

    // ---- Audio ----

    private static final int FALLBACK_SAMPLE_RATE = 44100;
    private static final int HOPS_PER_SECOND = 60;
    /** Jendela analisis. Sinkron dengan analyser.fftSize di index.html; jangan diperkecil (akurasi nada rendah). */
    private static final int WINDOW_SAMPLES = 4096;
    private static final long STOP_JOIN_TIMEOUT_MS = 250;

    // ---- Onset, retrigger, dan pelepasan (semua sinkron dengan index.html) ----

    private static final double ONSET_RMS = 0.012;
    private static final double ONSET_RATIO = 1.6;
    private static final long COOLDOWN_MS = 70;
    private static final double RELEASE_RMS = 0.012;
    private static final int RELEASE_CONFIRM_HOPS = 3;
    private static final long MAX_RELEASE_WAIT_MS = 1500;
    private static final double RETRIGGER_RATIO = 1.7;
    private static final double RETRIGGER_MIN_RMS = 0.012;
    private static final int RETRIGGER_WINDOW_HOPS = 5;
    private static final long MIN_RETRIGGER_GAP_MS = 110;
    /** 99 = jalur retrigger cepat sengaja dinonaktifkan (nilai asli setelah uji derau). */
    private static final double STRONG_RETRIGGER_RATIO = 99.0;
    private static final long STRONG_RETRIGGER_GAP_MS = 60;
    private static final double SMOOTHING_KEEP = 0.85;

    // ---- Pembacaan nada ----

    private static final double YIN_THRESHOLD = 0.15;
    private static final double YIN_MIN_RMS = 0.007;
    private static final long SETTLE_MS = 30;
    private static final int MAX_SAMPLE_TRIES = 5;

    /** Jalur cepat: satu bacaan dini (~17 ms) hanya untuk nada bersih di atas zona rawan oktaf. */
    private static final long FAST_READ_MS = 12;
    private static final double FAST_MIN_PROB = 0.90;
    private static final double FAST_MIN_FREQ = 300.0;
    private static final double FAST_MAX_CENTS = 15.0;

    /** Zona rawan oktaf (angka vs huruf): tunggu data lebih banyak dan minta konsensus lebih banyak. */
    private static final double LOW_ZONE_MAX_FREQ = 300.0;
    private static final long LOW_ZONE_MIN_AGE_MS = 66;
    private static final int LOW_ZONE_CONFIRM = 2;
    private static final int LOW_ZONE_CONFIRM_CORRECTED = 3;
    private static final int FUNCTIONAL_CONFIRM = 3;

    /** Ketukan badan gitar meluruh sangat cepat; senar sungguhan bertahan. */
    private static final double TAP_DECAY_RATIO = 0.30;
    private static final double STRONG_PROBABILITY = 0.80;

    // ---- Keamanan kategori tuts dan kalibrasi tuning ----

    private static final double CENTER_CENTS = 25;
    private static final double CENTER_MIN_PROBABILITY = 0.5;
    private static final double SAME_CATEGORY_MIN_PROBABILITY = 0.75;
    private static final double CROSS_CATEGORY_MIN_PROBABILITY = 0.9;
    private static final double CALIBRATION_LEARN_CENTS = 15;
    private static final double CALIBRATION_RATE = 0.05;
    private static final double CALIBRATION_LIMIT_CENTS = 45;

    // ---- Klasifikasi kick (hanya aktif jika KICK_FEATURE = true) ----

    private static final double KICK_CUTOFF_HZ = 150.0;
    private static final double KICK_MIN_PEAK_RMS = 0.04;
    /** Per tingkat: {rasio bass minimum, batas decay, batas probabilitas nada}. Sinkron dengan KICK_LEVELS di index.html. */
    private static final double[][] KICK_LEVELS = {
            {0.78, 0.45, 0.50},   // 0 = ketat
            {0.70, 0.55, 0.80},   // 1 = normal
            {0.62, 0.65, 1.01},   // 2 = peka
    };

    private static final double MIN_VALID_FREQ = 440.0 * Math.pow(2, (BASE_MIDI - 3 - 69) / 12.0);
    private static final double MAX_VALID_FREQ =
            440.0 * Math.pow(2, (BASE_MIDI + NOTE_COUNT - 1 + 3 - 69) / 12.0);

    private enum Phase { IDLE, SAMPLING, RELEASING }

    private enum NoteCategory { DIGIT, FUNCTIONAL, PUNCTUATION, LETTER_OR_SYMBOL }

    /** Hasil pencocokan frekuensi ke tuts. Dipakai ulang antar-bacaan (tanpa alokasi di thread audio). */
    private static final class NoteMatch {
        int idx;
        double centsOff;
        boolean safe;
    }

    /** Seluruh status mesin deteksi; hanya disentuh dari thread rekaman. */
    private static final class Tracker {
        Phase phase = Phase.IDLE;
        double smoothedRms = 0.001;
        long cooldownUntil;
        long releaseWaitUntil;
        long sampleAt;
        long fastAt;
        boolean fastTried = true;
        int sampleTries;
        int candidateIdx = -1;
        int candidateCount;
        long lastOnsetAt;
        int releaseBelowCount;
        double onsetPeakRms = 0.001;
        double onsetLowEnergy;
        double onsetFullEnergy;
        double lowPass1;
        double lowPass2;
        final double[] recentHopRms = new double[RETRIGGER_WINDOW_HOPS];
        int recentHopIdx;

        Tracker() {
            Arrays.fill(recentHopRms, 0.001);
        }
    }

    private final Context context;
    private final Handler mainHandler;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final PitchDsp dsp = new PitchDsp(MIN_VALID_FREQ, MAX_VALID_FREQ, YIN_THRESHOLD, YIN_MIN_RMS);
    private final NoteMatch match = new NoteMatch();
    private final float[] window = new float[WINDOW_SAMPLES];

    private volatile Listener listener;
    private AudioRecord audioRecord;
    private Thread recordThread;
    private volatile int sampleRate = FALLBACK_SAMPLE_RATE;
    private volatile int hopSamples = FALLBACK_SAMPLE_RATE / HOPS_PER_SECOND;

    private volatile boolean kickEnabled = KICK_FEATURE;
    private volatile int kickLevel = 1;
    /** Waktu (ms) dari onset sampai nada dikomit; hanya bagian yang berasal dari kode ini. */
    private volatile long lastLatencyMs;
    /** Pergeseran tuning (cent) yang dipelajari pelan-pelan dari bacaan paling jelas; dibatasi +-45. */
    private volatile double calibrationOffsetCents;

    public NativeMicPitchDetector(Context context) {
        this.context = context;
        this.mainHandler = new Handler(context.getMainLooper());
    }

    // ---- API publik ----

    public boolean hasPermission() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    public void setKickEnabled(boolean enabled) {
        this.kickEnabled = KICK_FEATURE && enabled;
    }

    public void setKickLevel(int level) {
        this.kickLevel = Math.max(0, Math.min(KICK_LEVELS.length - 1, level));
    }

    public long getLastLatencyMs() {
        return lastLatencyMs;
    }

    public synchronized boolean start(Listener newListener) {
        if (running.get()) return true;
        if (!hasPermission()) return false;

        this.listener = newListener;
        if (!openAudioRecord()) return false;

        running.set(true);
        audioRecord.startRecording();
        recordThread = new Thread(this::recordLoop, "GuitarWiterMicThread");
        recordThread.setPriority(Thread.MAX_PRIORITY);
        recordThread.start();
        return true;
    }

    public synchronized void stop() {
        running.set(false);
        final AudioRecord record = audioRecord;
        final Thread thread = recordThread;
        audioRecord = null;
        recordThread = null;

        if (record != null) {
            try {
                record.stop();
            } catch (IllegalStateException ignored) {
                // Sudah berhenti; aman diabaikan.
            }
        }
        // Tunggu thread rekaman keluar SEBELUM release(), supaya read() tidak menyentuh objek yang sudah dilepas.
        if (thread != null && thread != Thread.currentThread()) {
            try {
                thread.join(STOP_JOIN_TIMEOUT_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (record != null) record.release();
    }

    // ---- Persiapan audio ----

    /** Pilih sample rate native perangkat (tanpa resampling = latensi lebih rendah), cadangan 44100. */
    private boolean openAudioRecord() {
        for (int rate : candidateSampleRates()) {
            final int minBufferSize = AudioRecord.getMinBufferSize(
                    rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minBufferSize <= 0) continue;

            AudioRecord candidate = null;
            try {
                candidate = new AudioRecord(
                        MediaRecorder.AudioSource.MIC,
                        rate,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        Math.max(minBufferSize, WINDOW_SAMPLES * 4));
            } catch (SecurityException | IllegalArgumentException e) {
                continue;
            }
            if (candidate.getState() == AudioRecord.STATE_INITIALIZED) {
                audioRecord = candidate;
                sampleRate = rate;
                hopSamples = rate / HOPS_PER_SECOND;
                return true;
            }
            candidate.release();
        }
        return false;
    }

    private int[] candidateSampleRates() {
        int nativeRate = FALLBACK_SAMPLE_RATE;
        try {
            final AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            final String property = audioManager != null
                    ? audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE) : null;
            if (property != null) {
                final int value = Integer.parseInt(property.trim());
                if (value >= 16000 && value <= 48000) nativeRate = value;
            }
        } catch (RuntimeException ignored) {
            // Properti tidak tersedia / bukan angka: pakai rate cadangan.
        }
        return nativeRate == FALLBACK_SAMPLE_RATE
                ? new int[]{FALLBACK_SAMPLE_RATE}
                : new int[]{nativeRate, FALLBACK_SAMPLE_RATE};
    }

    // ---- Loop rekaman ----

    private void recordLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);

        // Pegang referensi lokal: stop() mengosongkan field dari thread lain.
        final AudioRecord record = this.audioRecord;
        if (record == null) return;

        final int hop = this.hopSamples;
        final short[] hopRaw = new short[hop];
        final Tracker tracker = new Tracker();
        final double lowPassAlpha = 1.0 - Math.exp(-2.0 * Math.PI * KICK_CUTOFF_HZ / this.sampleRate);
        Arrays.fill(window, 0f);

        while (running.get()) {
            final int read = record.read(hopRaw, 0, hop);
            if (read < 0) break;       // ERROR_INVALID_OPERATION / ERROR_DEAD_OBJECT: berhenti rapi
            if (read == 0) continue;

            // Geser jendela ke kiri sejauh "read" sampel lalu tempel sampel baru di ujung:
            // jendela selalu berisi sampel terbaru, diperbarui tiap hop (bukan tiap 4096 sampel).
            System.arraycopy(window, read, window, 0, WINDOW_SAMPLES - read);
            final int writeOffset = WINDOW_SAMPLES - read;
            double sumSquares = 0;
            double lowBandSquares = 0;
            for (int i = 0; i < read; i++) {
                final float v = hopRaw[i] / 32768f;
                window[writeOffset + i] = v;
                sumSquares += (double) v * v;
                tracker.lowPass1 += lowPassAlpha * (v - tracker.lowPass1);
                tracker.lowPass2 += lowPassAlpha * (tracker.lowPass1 - tracker.lowPass2);
                lowBandSquares += tracker.lowPass2 * tracker.lowPass2;
            }

            // RMS hanya dari hop yang baru masuk supaya onset terdengar secepat hop-nya sendiri.
            final double rms = Math.sqrt(sumSquares / read);
            final long now = SystemClock.elapsedRealtime();

            switch (tracker.phase) {
                case IDLE:
                    onIdleHop(tracker, rms, lowBandSquares, sumSquares, now);
                    break;
                case SAMPLING:
                    onSamplingHop(tracker, rms, lowBandSquares, sumSquares, now);
                    break;
                default:
                    onReleasingHop(tracker, rms, lowBandSquares, sumSquares, now);
                    break;
            }

            tracker.recentHopRms[tracker.recentHopIdx] = rms;
            tracker.recentHopIdx = (tracker.recentHopIdx + 1) % tracker.recentHopRms.length;
            tracker.smoothedRms = tracker.smoothedRms * SMOOTHING_KEEP + rms * (1 - SMOOTHING_KEEP);
        }
    }

    private void onIdleHop(Tracker t, double rms, double lowBandSq, double fullSq, long now) {
        if (rms > ONSET_RMS && rms > t.smoothedRms * ONSET_RATIO && now > t.cooldownUntil) {
            beginOnset(t, rms, lowBandSq, fullSq, now);
        }
    }

    private void onSamplingHop(Tracker t, double rms, double lowBandSq, double fullSq, long now) {
        t.onsetLowEnergy += lowBandSq;
        t.onsetFullEnergy += fullSq;
        // Puncak sungguhan sering baru tercapai beberapa ms setelah hop pemicu onset.
        if (rms > t.onsetPeakRms) t.onsetPeakRms = rms;

        if (!t.fastTried && now >= t.fastAt && now < t.sampleAt) {
            t.fastTried = true;
            tryFastRead(t, now);
        }
        if (t.phase == Phase.SAMPLING && now >= t.sampleAt) {
            readNote(t, rms, now);
        }
    }

    /** Jalur cepat: komit di hop pertama sesudah onset, hanya jika semua syarat ketat terpenuhi. */
    private void tryFastRead(Tracker t, long now) {
        final PitchDsp.Reading reading = dsp.detect(window, WINDOW_SAMPLES, sampleRate);
        if (reading == null
                || reading.freq < FAST_MIN_FREQ
                || reading.probability < FAST_MIN_PROB
                || !matchNote(reading.freq, reading.probability, match)
                || match.centsOff >= FAST_MAX_CENTS
                || (FUNCTIONAL_KEYS_STRICT && categoryOf(match.idx) != NoteCategory.LETTER_OR_SYMBOL)) {
            return;
        }
        commitNote(t, match.idx, reading.freq, now);
    }

    /** Bacaan normal: pembeda kick/tap, lalu konsensus beberapa bacaan sebelum komit. */
    private void readNote(Tracker t, double rms, long now) {
        final PitchDsp.Reading reading = dsp.detect(window, WINDOW_SAMPLES, sampleRate);
        t.sampleTries++;
        final boolean triesExhausted = t.sampleTries >= MAX_SAMPLE_TRIES;
        final double decayRatio = rms / t.onsetPeakRms;
        final double probability = reading != null ? reading.probability : 0.0;

        // Kick diperiksa dulu: "boom" kick sering terbaca YIN sebagai nada rendah yang meyakinkan.
        if (kickEnabled && isKick(t.onsetLowEnergy, t.onsetFullEnergy, t.onsetPeakRms, decayRatio, probability)) {
            lastLatencyMs = SystemClock.elapsedRealtime() - t.lastOnsetAt;
            postKick();
            enterReleasing(t, now);
            return;
        }

        if (reading == null) {
            // Tidak periodik berkali-kali walau cukup keras: ciri ketukan badan gitar.
            if (triesExhausted) {
                resolveNonTonalHit(t, decayRatio, 0.0);
                enterReleasing(t, now);
            }
            return;
        }

        final boolean safe = matchNote(reading.freq, reading.probability, match);
        final boolean looksPercussive = decayRatio < TAP_DECAY_RATIO && reading.probability < STRONG_PROBABILITY;

        if (safe && !looksPercussive) {
            confirmOrCommit(t, reading, triesExhausted, now);
        } else if (looksPercussive) {
            // Gestur sesaat: putuskan sekarang juga, tidak perlu konfirmasi berulang.
            resolveNonTonalHit(t, decayRatio, reading.probability);
            enterReleasing(t, now);
        } else if (triesExhausted) {
            postUnclear();
            enterReleasing(t, now);
        }
        // Selain itu: ragu di batas kategori dan jatah belum habis -> baca ulang di hop berikutnya.
    }

    /** Hitung konsensus bacaan sepakat; komit kalau cukup, atau paksa komit saat jatah habis. */
    private void confirmOrCommit(Tracker t, PitchDsp.Reading reading, boolean triesExhausted, long now) {
        final int idx = match.idx;
        if (idx == t.candidateIdx) {
            t.candidateCount++;
        } else {
            t.candidateIdx = idx;
            t.candidateCount = 1;
        }

        // Makin dekat pusat nada, makin sedikit bacaan sepakat yang diminta.
        int required = match.centsOff < 12 ? 1 : (match.centsOff < 22 ? 2 : 3);
        final long age = now - t.lastOnsetAt;
        final boolean lowZone = reading.freq < LOW_ZONE_MAX_FREQ;
        boolean ageOk = !lowZone || age >= LOW_ZONE_MIN_AGE_MS;
        if (lowZone) {
            required = Math.max(required, reading.octaveCorrected ? LOW_ZONE_CONFIRM_CORRECTED : LOW_ZONE_CONFIRM);
        }

        final boolean strictFunctional = FUNCTIONAL_KEYS_STRICT && categoryOf(idx) == NoteCategory.FUNCTIONAL;
        if (strictFunctional) {
            required = Math.max(required, FUNCTIONAL_CONFIRM);
            ageOk = ageOk && age >= LOW_ZONE_MIN_AGE_MS;
        }

        final boolean consensus = t.candidateCount >= required && ageOk;
        final boolean forced = triesExhausted && !strictFunctional;
        if (consensus || forced) {
            commitNote(t, idx, reading.freq, now);
        } else if (strictFunctional && triesExhausted) {
            enterReleasing(t, now);   // tuts fungsi tanpa konsensus penuh: abaikan diam-diam
        }
    }

    private void onReleasingHop(Tracker t, double rms, double lowBandSq, double fullSq, long now) {
        // "Lembah": titik paling pelan dalam beberapa hop terakhir. Lonjakan baru dianggap onset
        // hanya kalau ada lembah beneran, bukan riak (beating) dari petikan yang sama.
        double recentMin = t.recentHopRms[0];
        for (int i = 1; i < t.recentHopRms.length; i++) {
            if (t.recentHopRms[i] < recentMin) recentMin = t.recentHopRms[i];
        }

        final long minGap = rms > recentMin * STRONG_RETRIGGER_RATIO ? STRONG_RETRIGGER_GAP_MS : MIN_RETRIGGER_GAP_MS;
        final boolean retrigger = now > t.cooldownUntil
                && now - t.lastOnsetAt > minGap
                && rms > RETRIGGER_MIN_RMS
                && rms > recentMin * RETRIGGER_RATIO;

        if (retrigger) {
            beginOnset(t, rms, lowBandSq, fullSq, now);
        } else if (now > t.cooldownUntil && now > t.releaseWaitUntil) {
            // Jaring pengaman: kelamaan menunggu dengungan, paksa kembali ke IDLE.
            t.phase = Phase.IDLE;
            t.releaseBelowCount = 0;
        } else if (rms < RELEASE_RMS) {
            // Harus di bawah ambang beberapa hop BERTURUT-TURUT, bukan cuma sekali menyentuh.
            t.releaseBelowCount++;
            if (t.releaseBelowCount >= RELEASE_CONFIRM_HOPS && now > t.cooldownUntil) {
                t.phase = Phase.IDLE;
                t.releaseBelowCount = 0;
            }
        } else {
            t.releaseBelowCount = 0;
        }
    }

    // ---- Transisi status ----

    private void beginOnset(Tracker t, double rms, double lowBandSq, double fullSq, long now) {
        t.phase = Phase.SAMPLING;
        t.sampleTries = 0;
        t.candidateIdx = -1;
        t.candidateCount = 0;
        t.sampleAt = now + SETTLE_MS;
        t.fastAt = now + FAST_READ_MS;
        t.fastTried = false;
        t.lastOnsetAt = now;
        t.onsetPeakRms = rms;
        t.onsetLowEnergy = lowBandSq;
        t.onsetFullEnergy = fullSq;
        t.releaseBelowCount = 0;
        postOnset();
    }

    private void enterReleasing(Tracker t, long now) {
        t.phase = Phase.RELEASING;
        t.cooldownUntil = now + COOLDOWN_MS;
        t.releaseWaitUntil = now + MAX_RELEASE_WAIT_MS;
    }

    private void commitNote(Tracker t, int idx, double freq, long now) {
        lastLatencyMs = SystemClock.elapsedRealtime() - t.lastOnsetAt;
        if (idx >= 0 && idx < NOTE_COUNT) {
            if (PITCH_MODE_TOGGLE_KEYS || (idx != IDX_SYMBOLS && idx != IDX_EMOJI)) postPitchIndex(idx, freq);
        } else {
            postOutOfRange(freq);
        }
        enterReleasing(t, now);
    }

    // ---- Pencocokan frekuensi ke tuts ----

    private static double freqToMidi(double freq) {
        return 69 + 12 * (Math.log(freq / 440.0) / Math.log(2));
    }

    /**
     * Nada tersusun kromatis sehingga batas antar-kategori (mis. angka idx 9 dan huruf idx 10)
     * hanya terpisah satu setengah-nada. Sinkron dengan categoryOfIndex() di index.html.
     */
    private static NoteCategory categoryOf(int idx) {
        if (idx >= 0 && idx <= IDX_LAST_DIGIT) return NoteCategory.DIGIT;
        switch (idx) {
            case IDX_SHIFT:
            case IDX_BACKSPACE:
            case IDX_SYMBOLS:
            case IDX_EMOJI:
            case IDX_ENTER:
                return NoteCategory.FUNCTIONAL;
            case IDX_COMMA:
            case IDX_SPACE:
            case IDX_PERIOD:
                return NoteCategory.PUNCTUATION;
            default:
                return NoteCategory.LETTER_OR_SYMBOL;
        }
    }

    /**
     * Cocokkan frekuensi ke tuts terdekat dan nilai apakah cukup aman dikomit tanpa risiko ketuker
     * ke nada tetangga (apalagi beda kategori). Hasil ditulis ke {@code out}. Sinkron dengan
     * isCategorySafe() di index.html.
     *
     * <p>Efek samping: bacaan yang sangat jelas ikut menggeser {@link #calibrationOffsetCents}.</p>
     *
     * @return true kalau aman dikomit.
     */
    private boolean matchNote(double freq, double probability, NoteMatch out) {
        // Terapkan kalibrasi tuning sebelum dibulatkan ke nada terdekat.
        final double midiOffset = freqToMidi(freq) - BASE_MIDI - calibrationOffsetCents / 100.0;
        final int idx = (int) Math.round(midiOffset);
        out.idx = idx;
        if (idx < 0 || idx >= NOTE_COUNT) {
            out.centsOff = 100;
            out.safe = false;
            return false;
        }

        final double signedCentsOff = (midiOffset - idx) * 100;
        final double centsOff = Math.abs(signedCentsOff);
        out.centsOff = centsOff;

        final boolean safe;
        if (centsOff < CENTER_CENTS) {
            safe = probability >= CENTER_MIN_PROBABILITY;
        } else {
            final int neighbor = idx + (midiOffset >= idx ? 1 : -1);
            final boolean crossCategory = !(neighbor >= 0 && neighbor < NOTE_COUNT
                    && categoryOf(idx) == categoryOf(neighbor));
            safe = probability >= (crossCategory ? CROSS_CATEGORY_MIN_PROBABILITY : SAME_CATEGORY_MIN_PROBABILITY);
        }
        out.safe = safe;

        if (safe && centsOff < CALIBRATION_LEARN_CENTS) {
            final double learned = calibrationOffsetCents * (1 - CALIBRATION_RATE) + signedCentsOff * CALIBRATION_RATE;
            calibrationOffsetCents = Math.max(-CALIBRATION_LIMIT_CENTS, Math.min(CALIBRATION_LIMIT_CENTS, learned));
        }
        return safe;
    }

    // ---- Kick drum ----

    /** True kalau energi sejak onset didominasi pita rendah, meluruh cepat, dan tidak periodik. */
    private boolean isKick(double lowEnergy, double fullEnergy, double peakRms, double decayRatio, double pitchProbability) {
        if (peakRms < KICK_MIN_PEAK_RMS || fullEnergy <= 0) return false;
        final double[] level = KICK_LEVELS[kickLevel];
        if (decayRatio > level[1]) return false;        // masih bertahan = senar
        if (pitchProbability >= level[2]) return false; // periodik jelas = senar
        return Math.sqrt(lowEnergy / fullEnergy) >= level[0];
    }

    /** Satu-satunya jalan bunyi non-nada boleh mengetik: mode kick aktif DAN lolos isKick(). */
    private void resolveNonTonalHit(Tracker t, double decayRatio, double pitchProbability) {
        if (kickEnabled
                && isKick(t.onsetLowEnergy, t.onsetFullEnergy, t.onsetPeakRms, decayRatio, pitchProbability)) {
            postKick();
        } else {
            postNonTonalIgnored();
        }
    }

    // ---- Pengiriman ke UI thread ----

    /**
     * Pesan asinkron menembus "sync barrier" yang dipasang Android saat menggambar frame,
     * sehingga komit nada tidak tertahan jitter render WebView. Urutan antar-pesan tetap terjaga.
     */
    private void post(Runnable action) {
        final Message message = Message.obtain(mainHandler, action);
        message.setAsynchronous(true);
        mainHandler.sendMessage(message);
    }

    private void postOnset() {
        post(() -> {
            final Listener l = listener;
            if (l != null) l.onOnsetDetected();
        });
    }

    private void postPitchIndex(int idx, double freq) {
        post(() -> {
            final Listener l = listener;
            if (l != null) l.onPitchIndex(idx, freq);
        });
    }

    private void postOutOfRange(double freq) {
        post(() -> {
            final Listener l = listener;
            if (l != null) l.onOutOfRange(freq);
        });
    }

    private void postUnclear() {
        post(() -> {
            final Listener l = listener;
            if (l != null) l.onUnclear();
        });
    }

    private void postKick() {
        post(() -> {
            final Listener l = listener;
            if (l != null) l.onKick();
        });
    }

    private void postNonTonalIgnored() {
        post(() -> {
            final Listener l = listener;
            if (l != null) l.onNonTonalIgnored();
        });
    }
}
