package com.keyboardkustom.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
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
    }
}
