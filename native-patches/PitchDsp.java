package com.keyboardkustom.app;

/**
 * Inti pengolahan sinyal untuk deteksi nada: algoritma YIN (De Cheveigné &amp; Kawahara, 2002)
 * ditambah verifikasi oktaf lewat energi spektral (Goertzel).
 *
 * <p>Kelas ini murni (tanpa dependensi Android) supaya mudah diuji. Hasilnya harus identik dengan
 * {@code yinDetect()} di index.html. Instance TIDAK thread-safe: pakai dari satu thread saja
 * (thread rekaman), karena array kerja dipakai ulang antar-panggilan untuk menghindari sampah
 * memori (jeda GC di thread audio terasa sebagai ketikan tersendat).</p>
 *
 * <p>Optimasi: selisih YIN dihitung malas (per tau) dan pencarian berhenti begitu minimum lokal
 * pertama di bawah ambang ditemukan. Nada tinggi (tau kecil) jadi jauh lebih murah dihitung,
 * tanpa mengubah hasil.</p>
 */
final class PitchDsp {

    /** Hasil satu bacaan: frekuensi, seberapa periodik sinyalnya (0..1), dan apakah dikoreksi oktaf. */
    static final class Reading {
        final double freq;
        final double probability;
        final boolean octaveCorrected;

        Reading(double freq, double probability, boolean octaveCorrected) {
            this.freq = freq;
            this.probability = probability;
            this.octaveCorrected = octaveCorrected;
        }
    }

    /** Jika energi di setengah frekuensi sudah sebanding dengan ini, hasil YIN dianggap harmonik ke-2. */
    private static final double SUBHARMONIC_ENERGY_RATIO = 0.6;

    private final double minFreq;
    private final double maxFreq;
    private final double threshold;
    private final double minRms;

    private double[] cmnd = new double[0];

    // Status hitung bertahap CMNDF untuk satu panggilan detect().
    private int minTau;
    private int computedUpTo;
    private double runningSum;

    PitchDsp(double minFreq, double maxFreq, double threshold, double minRms) {
        this.minFreq = minFreq;
        this.maxFreq = maxFreq;
        this.threshold = threshold;
        this.minRms = minRms;
    }

    /** @return bacaan nada, atau null kalau sinyal terlalu pelan / tidak periodik. */
    Reading detect(float[] buf, int size, int sampleRate) {
        if (rms(buf, size) < minRms) return null;

        minTau = Math.max(2, (int) Math.floor(sampleRate / maxFreq));
        final int maxTau = Math.min(size / 2 - 1, (int) Math.ceil(sampleRate / minFreq));
        if (maxTau <= minTau) return null;

        ensureCapacity(maxTau + 1);
        final int window = size - maxTau;

        // CMNDF dihitung bertahap per tau; pencarian berhenti begitu minimum lokal pertama
        // di bawah ambang ketemu. Selisih di minTau sengaja tidak ikut jumlah berjalan.
        cmnd[minTau] = 1;
        computedUpTo = minTau;
        runningSum = 0;

        int tau = -1;
        for (int t = minTau + 1; t <= maxTau; t++) {
            if (cmndAt(buf, t, window) < threshold) {
                tau = t;
                break;
            }
        }
        if (tau == -1) return null;

        // Turun ke dasar lembah: berhenti saat CMNDF tidak lagi menurun.
        while (tau + 1 <= maxTau && cmndAt(buf, tau + 1, window) < cmnd[tau]) tau++;

        final double refinedTau = refineParabolic(tau, maxTau);
        if (refinedTau <= 0) return null;

        final double rawFreq = sampleRate / refinedTau;
        final double probability = 1 - cmnd[tau];
        return verifyOctave(buf, size, sampleRate, rawFreq, probability);
    }

    /** Hitung (kalau belum) lalu kembalikan CMNDF di tau. Tau diminta berurutan naik. */
    private double cmndAt(float[] buf, int tau, int window) {
        while (computedUpTo < tau) {
            final int next = ++computedUpTo;
            double sum = 0;
            for (int j = 0; j < window; j++) {
                final double d = buf[j] - buf[j + next];
                sum += d * d;
            }
            runningSum += sum;
            cmnd[next] = sum * (next - minTau) / (runningSum != 0 ? runningSum : 1e-9);
        }
        return cmnd[tau];
    }

    private double refineParabolic(int tau, int maxTau) {
        final int left = tau > minTau ? tau - 1 : tau;
        final int right = tau < maxTau ? tau + 1 : tau;
        if (left == tau || right == tau) return tau;
        final double s0 = cmnd[left];
        final double s1 = cmnd[tau];
        final double s2 = cmnd[right];
        final double denom = 2 * (2 * s1 - s2 - s0);
        return denom != 0 ? tau + (s2 - s0) / denom : tau;
    }

    /**
     * Cek oktaf lewat energi spektral langsung. Kalau energi di setengah frekuensi sudah
     * sebanding dengan di frekuensi hasil YIN, hasilnya cuma harmonik ke-2 -> turunkan satu oktaf.
     * Arah "naik" sengaja tidak ada: senar bawah punya harmonik ke-2 kuat, jadi koreksi naik
     * malah mengubah E2 yang benar menjadi E3.
     */
    private Reading verifyOctave(float[] buf, int size, int sampleRate, double rawFreq, double probability) {
        double finalFreq = rawFreq;
        final double halfFreq = rawFreq / 2;
        if (halfFreq >= minFreq) {
            final double magAtFreq = goertzelMag(buf, size, rawFreq, sampleRate);
            final double magAtHalf = goertzelMag(buf, size, halfFreq, sampleRate);
            if (magAtHalf >= magAtFreq * SUBHARMONIC_ENERGY_RATIO) finalFreq = halfFreq;
        }
        return new Reading(finalFreq, probability, finalFreq != rawFreq);
    }

    private void ensureCapacity(int length) {
        if (cmnd.length < length) cmnd = new double[length];
    }

    private static double rms(float[] buf, int size) {
        double sum = 0;
        for (int i = 0; i < size; i++) sum += (double) buf[i] * buf[i];
        return Math.sqrt(sum / size);
    }

    /** Algoritma Goertzel: magnitudo energi di SATU frekuensi target, tanpa FFT penuh. */
    static double goertzelMag(float[] buf, int size, double targetFreq, int sampleRate) {
        final int k = (int) Math.round(size * targetFreq / sampleRate);
        final double w = 2 * Math.PI * k / size;
        final double cosine = Math.cos(w);
        final double sine = Math.sin(w);
        final double coeff = 2 * cosine;
        double q1 = 0;
        double q2 = 0;
        for (int n = 0; n < size; n++) {
            final double q0 = coeff * q1 - q2 + buf[n];
            q2 = q1;
            q1 = q0;
        }
        final double real = q1 - q2 * cosine;
        final double imag = q2 * sine;
        return Math.sqrt(real * real + imag * imag) / size;
    }
}
