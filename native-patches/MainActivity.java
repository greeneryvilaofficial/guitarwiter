package com.keyboardkustom.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Aktivitas utama (ikon di app drawer). Tugas tambahannya: memunculkan pop-up izin mikrofon saat
 * pertama dibuka, karena HtmlKeyboardService (InputMethodService) tidak bisa memunculkannya sendiri.
 * Sama seperti Gboard: buka aplikasinya sekali, izinkan mikrofon, baru fitur suara keyboard aktif.
 */
public class MainActivity extends BridgeActivity {

    private static final int MIC_PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestMicrophoneIfNeeded();
    }

    private void requestMicrophoneIfNeeded() {
        final boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            ActivityCompat.requestPermissions(
                    this, new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION_REQUEST_CODE);
        }
    }
}
