/* ============================================================================================
 * [LABEL GWTR / LLAMA OFFLINE] src/lib/offline/llama.js
 * Adaptor ke Meta Llama 3.2 1B Instruct (GGUF) yang berjalan DI PERANGKAT lewat jembatan native `window.AndroidLlama`
 * (native-patches/LlamaBridge.java). Berkas ini TIDAK memuat model dan TIDAK punya jaringan.
 *
 * JUJUR soal status: kalau pustaka native (libgwllama.so) atau berkas model .gguf belum ada, status() melaporkannya
 * dan translate() mengembalikan { ok:false, error:'llama-unavailable' } — TIDAK pernah berpura-pura memakai Llama.
 * Kontrak jembatan (dua fungsi saja):
 *   AndroidLlama.status()                         -> JSON { nativeLib, modelPresent, modelPath, modelBytes, error }
 *   AndroidLlama.generateAsync(reqId, prompt, n)  -> '' segera; hasil dikirim ke window.__gwLlamaResult(reqId, json)
 *                                                    json = { ok, text } atau { ok:false, error }
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || NS.llama) return;
  var C = NS.core, pending = {}, seq = 0, busy = false;

  function bridge() { try { return root.AndroidLlama || null; } catch (e) { return null; } }

  /* Templat chat Llama 3.x. BOS ditambahkan oleh sisi native (tokenisasi dengan add_special=true), jadi default-nya tidak ikut ditulis. */
  function buildPrompt(text, from, to, opts) {
    var bos = opts && opts.includeBos ? '<|begin_of_text|>' : '';
    return bos + '<|start_header_id|>system<|end_header_id|>\n\n' + C.systemPrompt(from, to) + '<|eot_id|>' +
      '<|start_header_id|>user<|end_header_id|>\n\n' + text + '<|eot_id|>' +
      '<|start_header_id|>assistant<|end_header_id|>\n\n';
  }

  function status() {
    var b = bridge();
    if (!b || typeof b.status !== 'function') return { available: false, reason: 'no-bridge', text: 'Bukan keyboard Android / jembatan Llama tidak ada.' };
    var s; try { s = JSON.parse(b.status()); } catch (e) { return { available: false, reason: 'bad-status', text: 'Status Llama tidak terbaca.' }; }
    if (!s.nativeLib) return { available: false, reason: 'no-native-lib', text: 'Pustaka llama.cpp native belum dikompilasi ke APK ini.', info: s };
    if (!s.modelPresent) return { available: false, reason: 'no-model', text: 'Berkas model .gguf belum ada di ' + (s.modelPath || 'folder models/'), info: s };
    return { available: true, reason: 'ok', text: 'Llama siap (' + Math.round((s.modelBytes || 0) / 1048576) + ' MB).', info: s };
  }

  root.__gwLlamaResult = function (id, json) {
    var p = pending[id]; if (!p) return;
    delete pending[id]; clearTimeout(p.timer); busy = false;
    var r; try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { r = null; }
    if (!r || r.ok !== true) return p.resolve(C.fail('llama-failed', r && r.error));
    var out = C.cleanOutput(r.text);
    p.resolve(out ? C.done(out, 'llama', { note: 'Meta Llama 3.2 1B, di perangkat' }) : C.fail('llama-empty'));
  };

  function translate(text, from, to, opts) {
    var chk = C.checkInput(text, from, to); if (!chk.ok) return Promise.resolve(chk);
    var st = status(); if (!st.available) return Promise.resolve(C.fail('llama-unavailable', st.text));
    if (busy) return Promise.resolve(C.fail('busy'));
    busy = true;
    var id = ++seq, timeoutMs = (opts && opts.timeoutMs) || 180000;   // HP kentang bisa lambat; 3 menit
    var maxTok = Math.min(256, Math.ceil(chk.text.length / 2) + 64);
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { delete pending[id]; busy = false; resolve(C.fail('timeout')); }, timeoutMs);
      pending[id] = { resolve: resolve, timer: timer };
      try { bridge().generateAsync(id, buildPrompt(chk.text, from, to), maxTok); }
      catch (e) { delete pending[id]; clearTimeout(timer); busy = false; resolve(C.fail('llama-failed', e && e.message)); }
    });
  }

  NS.llama = { status: status, translate: translate, buildPrompt: buildPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
