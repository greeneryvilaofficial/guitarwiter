package com.keyboardkustom.app;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * [LABEL GWTR / LLAMA-BRIDGE] Jembatan JavaScript -> Meta Llama 3.2 1B Instruct (GGUF) di perangkat.
 * Terdaftar di WebView sebagai window.AndroidLlama (lihat HtmlKeyboardService). Kontrak: src/lib/offline/llama.js.
 *
 * STATUS JUJUR: kelas ini AMAN tanpa pustaka native. Bila libgwllama.so (JNI di atas llama.cpp) belum dikompilasi ke APK,
 * status() melaporkan nativeLib=false dan generateAsync() mengembalikan error "native-lib-missing" — tidak ada yang berpura-pura.
 * Model TIDAK dibundel di APK (terlalu besar untuk GitHub dan APK): taruh satu berkas *.gguf di
 *   Android/data/com.keyboardkustom.app/files/models/
 * Langkah menyambungkan llama.cpp: docs/LLAMA_ON_DEVICE.md.
 */
public class LlamaBridge {
    private static boolean nativeOk = false;
    private static String nativeErr = "";
    static {
        try { System.loadLibrary("gwllama"); nativeOk = true; }
        catch (Throwable t) { nativeOk = false; nativeErr = "libgwllama.so tidak ada"; }
    }

    /** Diimplementasikan di C++ (llama.cpp). Boleh melempar; selalu dibungkus try/catch di bawah. */
    private static native String nativeGenerate(String modelPath, String prompt, int maxTokens);

    private final Context ctx;
    private final WebView web;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();

    public LlamaBridge(Context ctx, WebView web) { this.ctx = ctx; this.web = web; }

    private File findModel() {
        File dir = new File(ctx.getExternalFilesDir(null), "models");
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) if (f.isFile() && f.getName().toLowerCase().endsWith(".gguf") && f.length() > 0) return f;
        return null;
    }

    private static String q(String s) {   // string JSON/JS aman
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    @JavascriptInterface
    public String status() {
        File m = findModel();
        String path = m != null ? m.getAbsolutePath() : new File(ctx.getExternalFilesDir(null), "models").getAbsolutePath();
        return "{\"nativeLib\":" + nativeOk + ",\"modelPresent\":" + (m != null) + ",\"modelPath\":" + q(path)
                + ",\"modelBytes\":" + (m != null ? m.length() : 0) + ",\"error\":" + q(nativeErr) + "}";
    }

    @JavascriptInterface
    public String generateAsync(final int reqId, final String prompt, final int maxTokens) {
        final int n = Math.max(16, Math.min(maxTokens, 512));
        final String p = prompt == null ? "" : (prompt.length() > 4000 ? prompt.substring(0, 4000) : prompt);
        exec.execute(new Runnable() {
            @Override public void run() {
                String json;
                try {
                    File m = findModel();
                    if (!nativeOk) json = "{\"ok\":false,\"error\":\"native-lib-missing\"}";
                    else if (m == null) json = "{\"ok\":false,\"error\":\"model-missing\"}";
                    else json = "{\"ok\":true,\"text\":" + q(String.valueOf(nativeGenerate(m.getAbsolutePath(), p, n))) + "}";
                } catch (Throwable t) {
                    json = "{\"ok\":false,\"error\":" + q(String.valueOf(t.getClass().getSimpleName())) + "}";
                }
                final String js = "window.__gwLlamaResult&&window.__gwLlamaResult(" + reqId + "," + q(json) + ")";
                web.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
            }
        });
        return "";
    }
}
