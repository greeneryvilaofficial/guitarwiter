/* ============================================================================================
 * [LABEL GWTR / CORE] src/lib/core.js  (v1.6.0)
 * Namespace GWTR: daftar bahasa, validasi input, prompt terjemahan, pembersih keluaran.
 * TIDAK ADA jaringan di berkas ini. Hanya src/lib/online/spark.js yang boleh menyentuh jaringan.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR = root.GWTR || {};
  if (NS.core) return;

  var LANGS = {
    id: { name: 'Indonesia', en: 'Indonesian' },
    en: { name: 'Inggris', en: 'English' },
    su: { name: 'Sunda', en: 'Sundanese' },
    jv: { name: 'Jawa', en: 'Javanese' }
  };
  var MAX_CHARS = 500;

  function fail(error, detail) { var r = { ok: false, error: error }; if (detail) r.detail = String(detail).slice(0, 200); return r; }
  function done(text, engine, extra) { var r = { ok: true, text: text, engine: engine }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function isLang(c) { return typeof c === 'string' && Object.prototype.hasOwnProperty.call(LANGS, c); }

  function checkInput(text, from, to) {
    if (!isLang(from) || !isLang(to)) return fail('bad-lang');
    if (from === to) return fail('same-lang');
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return fail('empty');
    if (t.length > MAX_CHARS) return fail('too-long', 'maks ' + MAX_CHARS + ' karakter');
    return { ok: true, text: t };
  }

  /* Prompt dipakai bersama oleh Llama (offline) dan Muse Spark (online). Bahasa Inggris supaya model kecil patuh. */
  function systemPrompt(from, to) {
    return 'You are a translation engine. Translate the user\'s text from ' + LANGS[from].en + ' to ' + LANGS[to].en +
      '. Output ONLY the translation: no quotes, no notes, no explanations. Keep names, numbers and emoji unchanged.';
  }

  function cleanOutput(s) {
    var t = String(s == null ? '' : s).replace(/\r/g, '').trim();
    t = t.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
    t = t.replace(/^(translation|terjemahan|hasil)\s*:\s*/i, '').trim();
    if (t.length > 1 && /^["“«].*["”»]$/.test(t)) t = t.slice(1, -1).trim();
    return t.slice(0, MAX_CHARS * 4);
  }

  NS.version = '1.6.0';
  NS.core = { LANGS: LANGS, MAX_CHARS: MAX_CHARS, fail: fail, done: done, isLang: isLang, checkInput: checkInput, systemPrompt: systemPrompt, cleanOutput: cleanOutput };
})(typeof window !== 'undefined' ? window : globalThis);
