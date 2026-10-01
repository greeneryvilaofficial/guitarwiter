package com.keyboardkustom.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.inputmethodservice.InputMethodService;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.text.InputType;
import android.text.TextUtils;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
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
import android.webkit.WebView;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;

/**
 * Keyboard (InputMethodService) yang menampilkan halaman HTML di WebView dan menjembatani
 * ketikan dari JavaScript ke InputConnection sistem (WhatsApp, Instagram, dsb).
 *
 * <p>Jalur ketikan, dari paling cepat:
 * <ol>
 *   <li><b>Komit langsung dari Java</b>: nada terdeteksi -> huruf diketik di UI thread tanpa bolak-balik ke JS
 *       (lihat {@link #noteMap}).</li>
 *   <li><b>WebMessageListener</b> ({@code AndroidKeyboardFast}): callback dijamin di UI thread, jadi tanpa
 *       loncatan thread tambahan.</li>
 *   <li><b>{@code window.AndroidKeyboard.*}</b>: cadangan penuh; dipanggil dari thread lain lalu dipindah ke UI thread.</li>
 * </ol>
 */
public class HtmlKeyboardService extends InputMethodService {

    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ASSET_ORIGIN + "/assets/public/index.html";
    private static final String FAST_BRIDGE_NAME = "AndroidKeyboardFast";
    private static final String BRIDGE_NAME = "AndroidKeyboard";

    private static final int FIELD_TEXT_CONTEXT_CHARS = 60;
    private static final long FIELD_SYNC_DEBOUNCE_MS = 120;
    private static final long CAPS_UPDATE_DELAY_MS = 50;
    private static final long COMPOSING_GRACE_MS = 400;
    private static final int MAX_CURSOR_STEPS = 40;

    private WebView webView;
    private ClipboardManager clipboardManager;
    private NativeMicPitchDetector nativeMic;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final Runnable capsRunnable = this::updateCapsNow;
    private final Runnable syncRunnable = () -> syncFieldText(false);
    private final ClipboardManager.OnPrimaryClipChangedListener clipListener = this::pushClipboardToJs;

    // ---- Status kolom aktif ----

    /** Kolom password / incognito: JS tidak boleh belajar kata. */
    private volatile boolean privateField;
    /** Ada teks terseleksi (blok biru). Diperbarui dari onUpdateSelection() tanpa biaya IPC ekstra. */
    private volatile boolean selectionActive;
    /** Huruf besar otomatis awal kalimat; Android yang menentukan lewat getCursorCapsMode(). */
    private volatile boolean capsPolicy;
    private volatile int capsMode;
    /** Bahasa non-Latin: teks sedang berstatus "composing" di aplikasi tujuan. */
    private volatile boolean composingActive;
    private volatile long lastComposeAt;

    // ---- Komit langsung nada (hanya diakses di UI thread) ----

    /** Peta idx nada -> huruf dari JS; null = tidak boleh diketik langsung (butuh logika JS). */
    private String[] noteMap;
    private boolean noteMapReady;
    /** true = mengetik satu huruf tidak mengubah status keyboard, jadi peta tetap siap sesudah komit. */
    private boolean noteMapStable;
    /** true = JS menjamin spasi sekarang tidak butuh autokoreksi / titik-ganda / penyusunan non-Latin. */
    private boolean spaceDirectOk;

    // =====================================================================================
    // Siklus hidup
    // =====================================================================================

    @Override
    public View onCreateInputView() {
        // WebView dibuat dan dimuat SEKALI lalu dipakai ulang, supaya keyboard muncul instan.
        if (webView != null) {
            detachFromParent(webView);
            return webView;
        }

        webView = new WebView(this);
        configureWebView(webView);
        registerBridges(webView);
        installClients(webView);

        nativeMic = new NativeMicPitchDetector(this);

        clipboardManager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboardManager != null) clipboardManager.addPrimaryClipChangedListener(clipListener);

        webView.loadUrl(START_URL);
        return webView;
    }

    private void configureWebView(WebView view) {
        final WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);   // halaman dimuat lewat https (AssetLoader), bukan file://
        view.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
    }

    private void registerBridges(WebView view) {
        view.addJavascriptInterface(new KeyboardBridge(), BRIDGE_NAME);

        // Jalur cepat: callback WebMessageListener dijamin di UI thread. Kalau tidak didukung / gagal,
        // JS otomatis memakai window.AndroidKeyboard.* biasa.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            try {
                WebViewCompat.addWebMessageListener(
                        view,
                        FAST_BRIDGE_NAME,
                        Collections.singleton(ASSET_ORIGIN),
                        (v, message, sourceOrigin, isMainFrame, replyProxy) ->
                                handleFastTypingMessage(message.getData()));
            } catch (RuntimeException ignored) {
                // Origin ditolak / fitur gagal: cadangan tetap tersedia.
            }
        }
    }

    private void installClients(WebView view) {
        // getUserMedia diblokir untuk file://; AssetLoader menyajikan file yang sama lewat origin https yang aman.
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        view.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Sudah di UI thread; grant() harus dipanggil langsung (jangan di-post).
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        return;
                    }
                }
                request.deny();
            }
        });
    }

    @Override
    public void onStartInputView(EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);

        // Kolom baru: tunggu peta nada terbaru dari JS sebelum komit langsung.
        noteMapReady = false;
        spaceDirectOk = false;

        privateField = detectPrivateField(info);
        selectionActive = info != null
                && info.initialSelStart >= 0 && info.initialSelEnd >= 0
                && info.initialSelStart != info.initialSelEnd;
        capsPolicy = info != null && !privateField
                && (info.inputType & InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_TEXT
                && (info.inputType & InputType.TYPE_TEXT_FLAG_CAP_SENTENCES) != 0;

        callJs(jsCall("onSelectionChanged", selectionActive),
                jsCall("onPrivateField", privateField),
                jsCall("onCapsPolicy", capsPolicy));

        uiHandler.removeCallbacks(capsRunnable);
        updateCapsNow();

        composingActive = false;
        callJs(jsCall("onComposingLost"));

        uiHandler.removeCallbacks(syncRunnable);
        syncFieldText(true);   // mulai dari isi kolom yang sebenarnya
    }

    @Override
    public void onUpdateSelection(int oldSelStart, int oldSelEnd, int newSelStart, int newSelEnd,
                                  int candidatesStart, int candidatesEnd) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd,
                candidatesStart, candidatesEnd);

        if (composingActive && candidatesStart == -1 && candidatesEnd == -1
                && SystemClock.uptimeMillis() - lastComposeAt > COMPOSING_GRACE_MS) {
            composingActive = false;
            callJs(jsCall("onComposingLost"));
        }

        // Didebounce: sekali saja setelah rentetan perubahan berhenti.
        uiHandler.removeCallbacks(syncRunnable);
        uiHandler.postDelayed(syncRunnable, FIELD_SYNC_DEBOUNCE_MS);
        if (capsPolicy) {
            uiHandler.removeCallbacks(capsRunnable);
            uiHandler.postDelayed(capsRunnable, CAPS_UPDATE_DELAY_MS);
        }

        final boolean hasSelection = newSelStart >= 0 && newSelEnd >= 0 && newSelStart != newSelEnd;
        if (hasSelection != selectionActive) {
            selectionActive = hasSelection;
            callJs(jsCall("onSelectionChanged", hasSelection));
        }
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        callJs(jsCall("onKeyboardShown"));
    }

    /** Keyboard disembunyikan (tutup, pindah app, layar mati): mikrofon HARUS mati. */
    @Override
    public void onWindowHidden() {
        super.onWindowHidden();
        uiHandler.removeCallbacks(capsRunnable);
        uiHandler.removeCallbacks(syncRunnable);

        if (composingActive) {
            final InputConnection ic = getCurrentInputConnection();
            if (ic != null) ic.finishComposingText();
            composingActive = false;
            callJs(jsCall("onComposingLost"));
        }
        if (nativeMic != null) nativeMic.stop();   // jaring pengaman kalau JS belum sempat menjawab
        callJs(jsCall("onKeyboardHidden"));
    }

    @Override
    public void onDestroy() {
        uiHandler.removeCallbacks(capsRunnable);
        uiHandler.removeCallbacks(syncRunnable);
        if (clipboardManager != null) clipboardManager.removePrimaryClipChangedListener(clipListener);
        if (nativeMic != null) nativeMic.stop();
        if (webView != null) {
            detachFromParent(webView);
            webView.destroy();   // field sengaja tidak di-null: callback mic yang masih antre tidak boleh kena NPE
        }
        super.onDestroy();
    }

    // =====================================================================================
    // Sinkronisasi status ke JS
    // =====================================================================================

    /** Kirim teks asli sebelum kursor ke JS supaya pelacak teks tidak ketinggalan. Dilewati di kolom privat. */
    private void syncFieldText(boolean force) {
        if (webView == null || privateField) return;
        final InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        final CharSequence before = ic.getTextBeforeCursor(FIELD_TEXT_CONTEXT_CHARS, 0);
        if (before == null) return;
        callJs(jsCall("onFieldText", before.toString(), force));
    }

    /** Tanya Android apakah huruf berikutnya harus kapital di posisi kursor, lalu kabari JS. */
    private void updateCapsNow() {
        if (webView == null) return;
        final InputConnection ic = getCurrentInputConnection();
        final EditorInfo editorInfo = getCurrentInputEditorInfo();
        int mode = 0;
        if (capsPolicy && ic != null && editorInfo != null) {
            mode = ic.getCursorCapsMode(TextUtils.CAP_MODE_SENTENCES);
        }
        capsMode = mode;
        callJs(jsCall("onAutoCaps", mode));
    }

    private void pushClipboardToJs() {
        if (clipboardManager == null || webView == null || !clipboardManager.hasPrimaryClip()) return;

        final ClipData clip = clipboardManager.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return;

        final CharSequence item = clip.getItemAt(0).coerceToText(this);
        if (item == null) return;

        // Clip yang ditandai sensitif (mis. password manager, Android 13+) tidak boleh masuk riwayat.
        boolean sensitive = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && clip.getDescription() != null) {
            final PersistableBundle extras = clip.getDescription().getExtras();
            sensitive = extras != null && extras.getBoolean("android.content.extra.IS_SENSITIVE", false);
        }

        final String js = jsCall("onClipboardChanged", item.toString(), sensitive);
        runOnUiThreadSafe(() -> callJs(js));
    }

    // =====================================================================================
    // Pembantu JS
    // =====================================================================================

    /** Bangun "window.fn && window.fn(args)"; String di-escape lewat JSONObject.quote(). Harus dieksekusi di UI thread. */
    private static String jsCall(String function, Object... args) {
        final StringBuilder sb = new StringBuilder("window.").append(function)
                .append(" && window.").append(function).append('(');
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(args[i] instanceof String ? JSONObject.quote((String) args[i]) : String.valueOf(args[i]));
        }
        return sb.append(')').toString();
    }

    /** Jalankan satu atau beberapa pernyataan JS sekaligus (satu panggilan evaluateJavascript). UI thread saja. */
    private void callJs(String... statements) {
        if (webView == null) return;
        webView.evaluateJavascript(TextUtils.join(";", statements), null);
    }

    /** Callback JavascriptInterface datang dari thread WebView, bukan UI thread. */
    private void runOnUiThreadSafe(Runnable action) {
        if (webView != null) {
            webView.post(action);
        } else {
            action.run();
        }
    }

    private static void detachFromParent(View view) {
        final ViewGroup parent = (ViewGroup) view.getParent();
        if (parent != null) parent.removeView(view);   // WebView hanya boleh punya satu parent
    }

    // =====================================================================================
    // Operasi InputConnection (dipakai bersama oleh KeyboardBridge dan jalur cepat)
    // =====================================================================================

    /** Ada blok terseleksi? Hapus seluruhnya dan kembalikan true. */
    private boolean deleteSelectionIfAny(InputConnection ic) {
        if (!selectionActive) return false;
        final CharSequence selected = ic.getSelectedText(0);
        final boolean hasSelection = selected != null && selected.length() > 0;
        selectionActive = false;
        if (hasSelection) ic.commitText("", 1);
        callJs(jsCall("onSelectionChanged", false));
        return hasSelection;
    }

    /** Hapus seleksi (kalau ada) atau {@code count} karakter sebelum kursor. */
    private void deleteBackward(InputConnection ic, int count) {
        if (count > 0 && !deleteSelectionIfAny(ic)) ic.deleteSurroundingText(count, 0);
    }

    /** Picu tombol aksi kolom (Kirim, Cari, Done, ...) kalau ada; kalau tidak, ketik baris baru. */
    private void performEnter(InputConnection ic) {
        final EditorInfo editorInfo = getCurrentInputEditorInfo();
        final int action = editorInfo != null
                ? (editorInfo.imeOptions & EditorInfo.IME_MASK_ACTION)
                : EditorInfo.IME_ACTION_UNSPECIFIED;
        final boolean noEnterAction = editorInfo != null
                && (editorInfo.imeOptions & EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0;

        if (!noEnterAction
                && action != EditorInfo.IME_ACTION_NONE
                && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
            ic.performEditorAction(action);
        } else {
            ic.commitText("\n", 1);
        }
    }

    /** Kolom password / incognito / minta tanpa personalisasi? */
    private static boolean detectPrivateField(EditorInfo info) {
        if (info == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && (info.imeOptions & EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING) != 0) {
            return true;
        }
        final int inputClass = info.inputType & InputType.TYPE_MASK_CLASS;
        final int variation = info.inputType & InputType.TYPE_MASK_VARIATION;
        if (inputClass == InputType.TYPE_CLASS_TEXT) {
            return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                    || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                    || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD;
        }
        if (inputClass == InputType.TYPE_CLASS_NUMBER) {
            return variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD;
        }
        return false;
    }

    // =====================================================================================
    // Komit langsung nada & jalur cepat WebMessageListener
    // =====================================================================================

    private void applyNoteMap(String json, boolean stable, boolean space) {
        try {
            final JSONArray array = new JSONArray(json);
            final String[] map = new String[array.length()];
            for (int i = 0; i < map.length; i++) {
                map[i] = array.isNull(i) ? null : array.getString(i);
            }
            noteMap = map;
            noteMapReady = true;
            noteMapStable = stable;
            spaceDirectOk = space;
        } catch (JSONException e) {
            noteMap = null;
            noteMapReady = false;
            noteMapStable = false;
            spaceDirectOk = false;
        }
    }

    /** Huruf yang boleh diketik langsung untuk nada idx, atau null kalau harus lewat JS. */
    private String directCharFor(int idx) {
        if (!noteMapReady || noteMap == null || idx < 0 || idx >= noteMap.length) return null;
        return noteMap[idx];
    }

    /**
     * Pesan dari window.AndroidKeyboardFast.postMessage() (fastBridge() di index.html), berformat
     * JSON kecil seperti {"cmd":"commitText","text":"a"}. Callback ini dijamin di UI thread.
     * Pesan rusak atau perintah tak dikenal diabaikan; JS selalu punya jalur cadangan.
     */
    private void handleFastTypingMessage(String data) {
        if (data == null) return;
        try {
            final JSONObject message = new JSONObject(data);
            final String command = message.optString("cmd", "");

            if ("setNoteMap".equals(command)) {   // tidak butuh InputConnection
                applyNoteMap(message.optString("map", ""),
                        message.optBoolean("stable", false), message.optBoolean("space", false));
                return;
            }

            final InputConnection ic = getCurrentInputConnection();
            if (ic == null) return;
            switch (command) {
                case "commitText":
                    if (!message.isNull("text")) ic.commitText(message.optString("text", ""), 1);
                    break;
                case "deleteBackward":
                    deleteBackward(ic, 1);
                    break;
                case "deleteBackwardN":
                    deleteBackward(ic, message.optInt("n", 1));
                    break;
                case "sendEnter":
                    performEnter(ic);
                    break;
                default:
                    break;
            }
        } catch (JSONException ignored) {
            // Format tak terduga: abaikan, jangan sampai keyboard crash.
        }
    }

    // =====================================================================================
    // Listener mikrofon
    // =====================================================================================

    /** Semua callback datang di UI thread (lihat NativeMicPitchDetector.post()). */
    private final class MicListener implements NativeMicPitchDetector.Listener {

        @Override
        public void onOnsetDetected() {
            // Sengaja kosong: status "mendengar" hanya kosmetik, dan satu evaluateJavascript per
            // petikan akan mengantre di main thread sebelum komit nada.
        }

        @Override
        public void onPitchIndex(int idx, double freq) {
            spaceDirectOk = false;   // teks akan berubah -> kelayakan spasi langsung basi

            final String direct = directCharFor(idx);
            final InputConnection ic = direct != null ? getCurrentInputConnection() : null;
            if (ic != null) {
                ic.commitText(direct, 1);   // ketik dulu, baru kabari JS
                noteMapReady = noteMapStable;   // tidak stabil -> tunggu peta baru dari JS
                callJs(jsCall("onNativePitchCommitted", idx, freq, direct, nativeMic.getLastLatencyMs()));
            } else {
                callJs(jsCall("onNativePitchIndex", idx, freq));
            }
        }

        @Override
        public void onOutOfRange(double freq) {
            callJs(jsCall("onNativeOutOfRange", freq));
        }

        @Override
        public void onUnclear() {
            callJs(jsCall("onNativeUnclear"));
        }

        @Override
        public void onKick() {
            final InputConnection ic = spaceDirectOk ? getCurrentInputConnection() : null;
            if (ic != null) {
                ic.commitText(" ", 1);
                spaceDirectOk = false;   // dua spasi beruntun butuh logika titik-ganda di JS
                callJs(jsCall("onNativeKickCommitted", nativeMic.getLastLatencyMs()));
            } else {
                callJs(jsCall("onNativeKick"));
            }
        }

        @Override
        public void onNonTonalIgnored() {
            // Sengaja kosong: bunyi non-nada diabaikan diam-diam.
        }
    }

    // =====================================================================================
    // Jembatan JavaScript: window.AndroidKeyboard.*
    // =====================================================================================

    /** Dipanggil dari thread WebView; hampir semuanya dipindah ke UI thread dulu. */
    private class KeyboardBridge {

        @JavascriptInterface
        public void commitText(final String text) {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic != null && text != null) ic.commitText(text, 1);
            });
        }

        @JavascriptInterface
        public void deleteBackward() {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic != null) HtmlKeyboardService.this.deleteBackward(ic, 1);
            });
        }

        /** Hapus beberapa karakter sekaligus (kata diganti lewat prediksi). */
        @JavascriptInterface
        public void deleteBackwardN(final int n) {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic != null) HtmlKeyboardService.this.deleteBackward(ic, n);
            });
        }

        @JavascriptInterface
        public void sendEnter() {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic != null) performEnter(ic);
            });
        }

        /** Dibaca JS saat halaman selesai dimuat (onStartInputView bisa datang lebih dulu). */
        @JavascriptInterface
        public boolean isPrivateField() {
            return privateField;
        }

        /** 0 = huruf kecil; selain 0 = awal kalimat (huruf besar). */
        @JavascriptInterface
        public int getCapsMode() {
            return capsMode;
        }

        @JavascriptInterface
        public boolean getCapsPolicy() {
            return capsPolicy;
        }

        /** Teks yang sedang disusun (Rusia/Arab/Jepang/dst): diganti utuh tiap ada huruf baru. */
        @JavascriptInterface
        public void setComposingText(final String text) {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic == null || text == null) return;
                ic.setComposingText(text, 1);
                composingActive = !text.isEmpty();
                lastComposeAt = SystemClock.uptimeMillis();
            });
        }

        /** "Kunci" teks yang sedang disusun (spasi / tanda baca / pilih saran). */
        @JavascriptInterface
        public void finishComposing() {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic != null) ic.finishComposingText();
                composingActive = false;
            });
        }

        /** Getaran halus saat tombol disentuh; mengikuti pengaturan getar sistem, tanpa izin tambahan. */
        @JavascriptInterface
        public void haptic() {
            runOnUiThreadSafe(() -> {
                if (webView != null) webView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            });
        }

        /** Geser di spasi: pindahkan kursor ke kiri (delta &lt; 0) / kanan (delta &gt; 0) sebanyak |delta| karakter. */
        @JavascriptInterface
        public void moveCursor(final int delta) {
            runOnUiThreadSafe(() -> {
                final InputConnection ic = getCurrentInputConnection();
                if (ic == null || delta == 0) return;
                final int keyCode = delta < 0 ? KeyEvent.KEYCODE_DPAD_LEFT : KeyEvent.KEYCODE_DPAD_RIGHT;
                final int steps = Math.min(Math.abs(delta), MAX_CURSOR_STEPS);
                for (int i = 0; i < steps; i++) {
                    ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
                    ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
                }
            });
        }

        /** Tombol "Bagikan": buka lembar bagikan Android dengan teks dari JS. */
        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThreadSafe(() -> {
                try {
                    final Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    final Intent chooser = Intent.createChooser(send, "Bagikan Guitarwiter");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(chooser);
                } catch (RuntimeException ignored) {
                    // Tidak ada aplikasi penerima / aktivitas tidak bisa dibuka.
                }
            });
        }

        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThreadSafe(() -> requestHideSelf(0));
        }

        /** Untuk tombol "globe" (ganti keyboard). */
        @JavascriptInterface
        public void switchToNextKeyboard() {
            runOnUiThreadSafe(() -> {
                final InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.showInputMethodPicker();
            });
        }

        /** Cadangan bila AndroidKeyboardFast tidak tersedia: peta nada -> huruf untuk komit langsung. */
        @JavascriptInterface
        public void setNoteMap(final String json) {
            runOnUiThreadSafe(() -> applyNoteMap(json, false, false));
        }

        /** Mulai deteksi nada lewat AudioRecord native; hasil dikirim ke JS (window.onNative*). */
        @JavascriptInterface
        public boolean startNativeMic() {
            if (nativeMic == null) return false;
            if (!nativeMic.hasPermission()) {
                runOnUiThreadSafe(() -> callJs(jsCall("onNativeMicStatus", "permission", false)));
                return false;
            }
            final boolean started = nativeMic.start(new MicListener());
            if (started) {
                runOnUiThreadSafe(() -> callJs(jsCall("onNativeMicStatus", "listening", true)));
            }
            return started;
        }

        /** Mode deteksi (Setelan): true = Senar + Kick (kick -> spasi), false = Nada saja. */
        @JavascriptInterface
        public void setKickEnabled(final boolean enabled) {
            if (nativeMic != null) nativeMic.setKickEnabled(enabled);
        }

        /** Sensitivitas kick: 0 ketat, 1 normal, 2 peka. */
        @JavascriptInterface
        public void setKickLevel(final int level) {
            if (nativeMic != null) nativeMic.setKickLevel(level);
        }

        @JavascriptInterface
        public void stopNativeMic() {
            if (nativeMic != null) nativeMic.stop();
        }
    }
}
