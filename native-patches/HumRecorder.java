package com.keyboardkustom.app;

/**
 * [LABEL MUSE WONDER / PEREKAM HUMMING 30 DETIK]
 * Cincin sampel (ring buffer) yang menyimpan 30 detik terakhir audio mic, mono 16-bit, diturunkan ke ~16 kHz
 * (cukup untuk humming; ~0,96 MB). Java murni tanpa dependensi Android supaya bisa diuji sendiri.
 * Hanya terisi selama start() aktif -> bawaan MATI, jadi tidak ada biaya memori/CPU saat tidak dipakai.
 * Dipanggil dari loop baca mic NativeMicPitchDetector (feed) dan dari KeyboardBridge (start/stop/wav).
 */
final class HumRecorder {
    static final int TARGET_RATE = 16000;
    static final int MAX_SECONDS = 30;

    private volatile boolean on = false;
    private short[] ring = new short[0];
    private int pos, filled, factor = 1, outRate = TARGET_RATE, acc, accN;

    boolean isOn() { return on; }

    /** srcRate = laju sampel mic (mis. 44100/48000). Mengosongkan rekaman lama. */
    synchronized void start(int srcRate) {
        factor = Math.max(1, Math.round(srcRate / (float) TARGET_RATE));
        outRate = srcRate / factor;
        ring = new short[outRate * MAX_SECONDS];
        pos = 0; filled = 0; acc = 0; accN = 0;
        on = true;
    }

    synchronized void stop() { on = false; }

    /** Dipanggil dari thread mic tiap hop. Murah: keluar langsung kalau tidak merekam. */
    void feed(short[] raw, int n) {
        if (!on) return;
        synchronized (this) {
            if (!on) return;
            for (int i = 0; i < n; i++) {
                acc += raw[i];
                if (++accN == factor) {
                    ring[pos] = (short) (acc / factor);
                    pos = (pos + 1) % ring.length;
                    if (filled < ring.length) filled++;
                    acc = 0; accN = 0;
                }
            }
        }
    }

    synchronized int seconds() { return outRate == 0 ? 0 : filled / outRate; }

    /** WAV (PCM 16-bit mono) dari sampel terlama -> terbaru, maksimum 30 dtk. Kosong (44 byte header saja) bila belum ada. */
    synchronized byte[] wav() {
        int n = filled, dataLen = n * 2;
        byte[] out = new byte[44 + dataLen];
        writeStr(out, 0, "RIFF"); le32(out, 4, 36 + dataLen); writeStr(out, 8, "WAVE");
        writeStr(out, 12, "fmt "); le32(out, 16, 16); le16(out, 20, 1); le16(out, 22, 1);
        le32(out, 24, outRate); le32(out, 28, outRate * 2); le16(out, 32, 2); le16(out, 34, 16);
        writeStr(out, 36, "data"); le32(out, 40, dataLen);
        int start = (filled < ring.length) ? 0 : pos;           // belum penuh: mulai dari 0; penuh: dari yang tertua
        for (int i = 0; i < n; i++) {
            short s = ring[(start + i) % ring.length];
            out[44 + 2 * i] = (byte) (s & 0xff);
            out[45 + 2 * i] = (byte) ((s >> 8) & 0xff);
        }
        return out;
    }

    private static void writeStr(byte[] b, int o, String s) { for (int i = 0; i < s.length(); i++) b[o + i] = (byte) s.charAt(i); }
    private static void le16(byte[] b, int o, int v) { b[o] = (byte) v; b[o + 1] = (byte) (v >> 8); }
    private static void le32(byte[] b, int o, int v) { le16(b, o, v); le16(b, o + 2, v >> 16); }
}
