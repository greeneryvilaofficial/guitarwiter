package com.keyboardkustom.app;

import android.inputmethodservice.InputMethodService;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Build;
import android.os.PersistableBundle;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * InputMethodService yang menampilkan file HTML keyboard sebagai WebView,
 * dan menjembatani ketikan dari JavaScript ke InputConnection sistem Android
 * (kolom chat WhatsApp, Instagram, dsb).
 */
public class HtmlKeyboardService extends InputMethodService {

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private ClipboardManager clipboardManager;
    private NativeMicPitchDetector nativeMic;
    // true kalau kolom yang sedang aktif adalah password / incognito -> JS tidak boleh belajar kata.
    private volatile boolean privateField = false;
    private final ClipboardManager.OnPrimaryClipChangedListener clipListener = this::pushClipboardToJs;

    @Override
    public View onCreateInputView() {
        // Booster: WebView hanya dibuat & di-load SEKALI. Sebelumnya, setiap
        // kali keyboard muncul (pindah kolom/aplikasi), sistem memanggil
        // onCreateInputView() lagi dan kode lama membuat WebView baru +
        // reload index.html dari nol setiap saat — ini yang bikin terasa
        // delay/lag di HP dengan spek ringan. Sekarang WebView yang sama
        // dipakai ulang terus, jadi keyboard muncul instan setelah kemunculan pertama.
        if (webView != null) {
            // WebView cuma boleh punya satu parent. Lepas dulu dari parent
            // lama sebelum dipakai ulang, kalau tidak sistem akan crash.
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            return webView;
        }

        webView = new WebView(this);
        WebSettings webSettings = webView.getSettings();

        // Mengaktifkan JavaScript agar logika tombol berfungsi
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        // Halaman dimuat lewat WebViewAssetLoader (https), bukan file:// -> akses file tidak diperlukan.
        webSettings.setAllowFileAccess(false);

        // Booster rendering: pakai layer hardware & matikan overscroll bounce
        // yang tidak perlu untuk tampilan keyboard.
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Daftarkan jembatan: di JavaScript akan muncul sebagai window.AndroidKeyboard
        webView.addJavascriptInterface(new KeyboardBridge(), "AndroidKeyboard");

        nativeMic = new NativeMicPitchDetector(this);

        // Fitur clipboard: pantau perubahan clipboard sistem Android, lalu
        // kirim isinya ke JavaScript supaya muncul di panel riwayat clipboard.
        clipboardManager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboardManager != null) {
            clipboardManager.addPrimaryClipChangedListener(clipListener);
        }

        // PENTING: getUserMedia (dipakai fitur deteksi nada gitar) DIBLOKIR browser/WebView
        // kalau halaman dimuat lewat file:// langsung -- itu dianggap "origin tidak aman",
        // apa pun izin Android-nya. WebViewAssetLoader ini bikin WebView memuat file yang
        // SAMA PERSIS dari folder assets, tapi lewat alamat https://appassets.androidplatform.net/...
        // yang dianggap origin aman, sehingga getUserMedia bisa benar-benar diizinkan.
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        // Fitur mikrofon (deteksi nada gitar): JS memanggil getUserMedia({audio:true}),
        // dan WebView butuh persetujuan lewat onPermissionRequest ini. Diberikan otomatis
        // KALAU izin RECORD_AUDIO di level sistem Android sudah diizinkan lewat MainActivity
        // (dicek otomatis oleh Android — kalau belum diizinkan, request ini tidak akan pernah
        // datang dan mic tidak akan aktif, makanya aplikasi wajib dibuka sekali dulu).
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // PENTING: onPermissionRequest ini SUDAH berjalan di UI thread bawaan
                // Android. Sebelumnya kode ini membungkus grant() dengan webView.post(),
                // yang menunda eksekusinya ke antrian berikutnya -- di sebagian WebView
                // (termasuk yang dipakai beberapa HP ColorOS), penundaan ini bisa bikin
                // permintaan izin keburu dianggap gagal sebelum grant() sempat jalan,
                // persis menghasilkan error NotAllowedError. Sekarang dipanggil langsung.
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        return;
                    }
                }
                request.deny();
            }
        });

        // Memuat file HTML lewat WebViewAssetLoader (BUKAN file:// lagi), supaya origin-nya
        // dianggap aman dan getUserMedia bisa berfungsi.
        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html");

        return webView;
    }

    /**
     * Dipanggil setiap kali kolom input baru mendapat fokus (mis. pindah dari
     * kolom pencarian ke kolom chat). Berguna kalau nanti ingin menyesuaikan
     * tampilan tombol Enter (Kirim/Cari/Enter biasa) sesuai imeOptions.
     */
    @Override
    public void onStartInputView(EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);
        // Deteksi kolom privat (password, incognito, dst) tiap kali pindah kolom.
        privateField = isPrivateField(info);
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.onPrivateField && window.onPrivateField(" + privateField + ")", null);
        }
    }

    /** Keyboard benar-benar terlihat lagi -> JS boleh menyalakan mic (kalau tidak dijeda manual). */
    @Override
    public void onWindowShown() {
        super.onWindowShown();
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.onKeyboardShown && window.onKeyboardShown()", null);
        }
    }

    /**
     * Keyboard disembunyikan (tutup, pindah app, layar mati, dst) -> mikrofon HARUS mati.
     * Dipakai onWindowHidden (bukan onFinishInputView) supaya mic tidak mati-hidup
     * setiap kali cuma pindah antar kolom di layar yang sama.
     */
    @Override
    public void onWindowHidden() {
        super.onWindowHidden();
        if (nativeMic != null) nativeMic.stop();   // jaring pengaman kalau JS belum sempat menjawab
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.onKeyboardHidden && window.onKeyboardHidden()", null);
        }
    }

    /** Kolom password / incognito / minta tanpa personalisasi? */
    private static boolean isPrivateField(EditorInfo info) {
        if (info == null) return false;
        if (Build.VERSION.SDK_INT >= 26
                && (info.imeOptions & EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING) != 0) {
            return true;
        }
        int cls = info.inputType & InputType.TYPE_MASK_CLASS;
        int variation = info.inputType & InputType.TYPE_MASK_VARIATION;
        if (cls == InputType.TYPE_CLASS_TEXT) {
            return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                    || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                    || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD;
        }
        if (cls == InputType.TYPE_CLASS_NUMBER) {
            return variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD;
        }
        return false;
    }

    @Override
    public void onDestroy() {
        if (clipboardManager != null) {
            clipboardManager.removePrimaryClipChangedListener(clipListener);
        }
        if (nativeMic != null) {
            nativeMic.stop();
        }
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();   // field sengaja TIDAK di-null: callback mic yang masih antre tidak boleh kena NPE
        }
        super.onDestroy();
    }

    /** Ambil teks clipboard terbaru, lalu kirim ke JavaScript lewat window.onClipboardChanged(). */
    private void pushClipboardToJs() {
        if (clipboardManager == null || webView == null) return;
        if (!clipboardManager.hasPrimaryClip()) return;

        ClipData clip = clipboardManager.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return;

        CharSequence item = clip.getItemAt(0).coerceToText(this);
        if (item == null) return;

        // Clip yang ditandai sensitif oleh pengirimnya (mis. password manager, Android 13+):
        // jangan disimpan ke riwayat -- JS diberi tahu lewat argumen kedua.
        boolean sensitive = false;
        if (Build.VERSION.SDK_INT >= 23 && clip.getDescription() != null) {   // getExtras() baru ada di API 23
            PersistableBundle extras = clip.getDescription().getExtras();
            sensitive = extras != null && extras.getBoolean("android.content.extra.IS_SENSITIVE", false);
        }

        // JSONObject.quote() menghasilkan literal string JS yang aman (sudah termasuk tanda kutip),
        // termasuk untuk karakter CR dan pemisah baris Unicode yang dulu merusak string JS.
        final String js = "window.onClipboardChanged && window.onClipboardChanged("
                + JSONObject.quote(item.toString()) + "," + sensitive + ")";

        final WebView wv = webView;
        wv.post(() -> wv.evaluateJavascript(js, null));
    }

    /** Objek yang diekspos ke JavaScript lewat window.AndroidKeyboard.* */
    private class KeyboardBridge {

        @JavascriptInterface
        public void commitText(final String text) {
            runOnUiThreadSafe(() -> {
                InputConnection ic = getCurrentInputConnection();
                if (ic != null && text != null) {
                    ic.commitText(text, 1);
                }
            });
        }

        @JavascriptInterface
        public void deleteBackward() {
            runOnUiThreadSafe(() -> {
                InputConnection ic = getCurrentInputConnection();
                if (ic != null) {
                    ic.deleteSurroundingText(1, 0);
                }
            });
        }

        /** Hapus beberapa karakter sekaligus — dipakai saat kata diganti lewat prediksi. */
        @JavascriptInterface
        public void deleteBackwardN(final int n) {
            runOnUiThreadSafe(() -> {
                InputConnection ic = getCurrentInputConnection();
                if (ic != null && n > 0) {
                    ic.deleteSurroundingText(n, 0);
                }
            });
        }

        @JavascriptInterface
        public void sendEnter() {
            runOnUiThreadSafe(() -> {
                InputConnection ic = getCurrentInputConnection();
                if (ic == null) return;

                EditorInfo ei = getCurrentInputEditorInfo();
                int action = (ei != null)
                        ? (ei.imeOptions & EditorInfo.IME_MASK_ACTION)
                        : EditorInfo.IME_ACTION_UNSPECIFIED;

                boolean noEnterFlag = ei != null
                        && (ei.imeOptions & EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0;

                if (!noEnterFlag
                        && action != EditorInfo.IME_ACTION_NONE
                        && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                    // Kolom ini punya tombol aksi (Kirim, Cari, Done, dst) -> picu itu
                    ic.performEditorAction(action);
                } else {
                    // Kolom multi-baris biasa -> ketik baris baru
                    ic.commitText("\n", 1);
                }
            });
        }

        /** Dibaca JS saat halaman baru selesai dimuat (onStartInputView bisa datang lebih dulu). */
        @JavascriptInterface
        public boolean isPrivateField() {
            return privateField;
        }

        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThreadSafe(() -> requestHideSelf(0));
        }

        /** Dipanggil kalau nanti ditambahkan tombol "globe" untuk ganti keyboard. */
        @JavascriptInterface
        public void switchToNextKeyboard() {
            runOnUiThreadSafe(() -> {
                InputMethodManager imm =
                        (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) {
                    imm.showInputMethodPicker();
                }
            });
        }

        /**
         * Mulai deteksi nada LEWAT JAVA NATIVE (AudioRecord), bukan getUserMedia().
         * Hasil deteksi dikirim balik ke JS lewat window.onNativePitchIndex/dst.
         */
        @JavascriptInterface
        public boolean startNativeMic() {
            if (nativeMic == null) return false;
            if (!nativeMic.hasPermission()) {
                runOnUiThreadSafe(() -> webView.evaluateJavascript(
                        "window.onNativeMicStatus && window.onNativeMicStatus('permission', false)", null));
                return false;
            }
            boolean started = nativeMic.start(new NativeMicPitchDetector.Listener() {
                @Override
                public void onOnsetDetected() {
                    webView.evaluateJavascript(
                            "window.onNativeMicStatus && window.onNativeMicStatus('onset', true)", null);
                }
                @Override
                public void onPitchIndex(int idx, double freq) {
                    webView.evaluateJavascript(
                            "window.onNativePitchIndex && window.onNativePitchIndex(" + idx + "," + freq + ")", null);
                }
                @Override
                public void onOutOfRange(double freq) {
                    webView.evaluateJavascript(
                            "window.onNativeOutOfRange && window.onNativeOutOfRange(" + freq + ")", null);
                }
                @Override
                public void onUnclear() {
                    webView.evaluateJavascript(
                            "window.onNativeUnclear && window.onNativeUnclear()", null);
                }
                @Override
                public void onPercussiveTap() {
                    webView.evaluateJavascript(
                            "window.onNativePercussiveTap && window.onNativePercussiveTap()", null);
                }
            });
            if (started) {
                runOnUiThreadSafe(() -> webView.evaluateJavascript(
                        "window.onNativeMicStatus && window.onNativeMicStatus('listening', true)", null));
            }
            return started;
        }

        @JavascriptInterface
        public void stopNativeMic() {
            if (nativeMic != null) nativeMic.stop();
        }
    }

    /** JavascriptInterface callback datang dari thread WebView, bukan UI thread. */
    private void runOnUiThreadSafe(Runnable r) {
        if (webView != null) {
            webView.post(r);
        } else {
            r.run();
        }
    }
}
