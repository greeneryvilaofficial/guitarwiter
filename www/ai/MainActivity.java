package com.keyboardkustom.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import org.json.JSONObject;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Aktivitas utama aplikasi (yang ikonnya muncul di app drawer).
 * Tugas tambahannya: memicu pop-up izin mikrofon sistem Android saat
 * pertama kali dibuka — karena HtmlKeyboardService (InputMethodService)
 * TIDAK BISA memunculkan pop-up izin itu sendiri. Ini sama seperti Gboard:
 * buka aplikasinya sekali, izinkan mikrofon, baru fitur suara di keyboard aktif.
 */
public class MainActivity extends BridgeActivity {

    private static final int MIC_PERMISSION_REQUEST_CODE = 1001;
    private static final String EXTRA_TRIGGER_SPARK = "trigger_spark";   // HARUS sama dengan HtmlKeyboardService

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    MIC_PERMISSION_REQUEST_CODE
            );
        }

        handleSparkIntent(getIntent());   // dibuka lewat Intent Spark dari keyboard (proses baru)
    }

    // ===== [LABEL MUSE SPARK / INTENT] =====
    /** Aktivitas sudah hidup (SINGLE_TOP): Intent baru datang di sini, bukan onCreate. public = aman untuk versi super mana pun. */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSparkIntent(intent);
    }

    private void handleSparkIntent(Intent intent) {
        if (intent == null) return;
        String preset = intent.getStringExtra(EXTRA_TRIGGER_SPARK);
        if (preset == null || preset.length() > 40) return;
        intent.removeExtra(EXTRA_TRIGGER_SPARK);   // jangan terpicu ulang saat Activity dibuat ulang (rotasi)
        final WebView wv = (getBridge() != null) ? getBridge().getWebView() : null;
        if (wv == null) return;
        // Halaman bisa belum selesai dimuat: coba tiap 200 ms sampai window.onSparkTrigger ada (maks 10 dtk).
        final String js = "(function(p){var n=0;(function t(){if(window.onSparkTrigger){window.onSparkTrigger(p);}"
                + "else if(n++<50){setTimeout(t,200);}})();})(" + JSONObject.quote(preset) + ")";
        wv.post(() -> wv.evaluateJavascript(js, null));
    }
}
