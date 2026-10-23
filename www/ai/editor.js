/* ============================================================================================
 * [LABEL MUSE SPARK] guitarwriter.com/ai/editor.js  (v1.4.0)
 * Perintah singkat ("bikin lebih bluesy") -> Spark memberi tab baru -> tab aktif langsung diubah.
 *
 * Alur:  teks diketik/dipetik  ->  GWAI.editor.run(teks)  ->  Spark  ->  validasi ketat  ->  GWAI.tab.set()
 *        (satu langkah undo: GWAI.tab.undo()).  Event: 'gw:ai-instruction' (masuk), 'gw:tab-changed' (keluar).
 *
 * Kontrak ADAPTOR (bukan spesifikasi resmi vendor; sesuaikan lewat GWAI.hooks.spark):
 *   POST {baseUrl}{path||'/edit'}   body: { model, instruction, tab, schema:'gw-tab-v1' }
 *   respons: { tab:{...} }  ATAU  { text:'<JSON tab, boleh dibungkus ```json>' }
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || G.editor) return;
  var busy = false;

  // Kata pembuka perintah yang dianggap instruksi (bukan teks biasa) -- dipakai matchCommand().
  var CMD = /^\s*(bikin|buat|ubah|jadikan|ganti|tambah(?:in|kan)?|kurangi|percepat|perlambat|make|turn|change)\b/i;

  function matchCommand(text) { return typeof text === 'string' && text.length <= 200 && CMD.test(text); }

  function run(instruction) {
    instruction = String(instruction || '').trim().slice(0, 200);
    if (!instruction) return Promise.resolve({ ok: false, error: 'empty-instruction' });
    if (!G.enabled('spark')) return Promise.resolve({ ok: false, error: 'not-configured' });
    var cur = G.tab.get();
    if (!cur) return Promise.resolve({ ok: false, error: 'no-active-tab' });
    if (busy) return Promise.resolve({ ok: false, error: 'busy' });          // satu perintah sekali jalan
    busy = true; G.emit('gw:spark-start', { instruction: instruction });
    var cfg = G.getConfig().services.spark;
    var path = cfg.path || '/edit';
    return G.call('spark', { model: cfg.model || undefined, instruction: instruction, tab: cur, schema: 'gw-tab-v1' }, { path: path })
      .then(function (r) {
        if (!r.ok) return r;
        var d = r.data || {};
        var v = G.tab.validate(d.tab != null ? d.tab : d.text);
        if (!v.ok) return v;                                                  // jawaban rusak -> tab TIDAK diubah
        var s = G.tab.set(v.data, 'spark:' + instruction);
        return s.ok ? { ok: true, data: s.data, dropped: v.dropped } : s;
      })
      .then(function (res) { busy = false; G.emit('gw:spark-end', res); return res; },
            function () { busy = false; return { ok: false, error: 'unexpected' }; });
  }

  // Jembatan event: aplikasi cukup memanggil document.dispatchEvent(new CustomEvent('gw:ai-instruction',{detail:{text}}))
  try { root.document.addEventListener('gw:ai-instruction', function (e) { var t = e && e.detail && e.detail.text; if (t) run(t); }); } catch (e) {}

  G.editor = { run: run, matchCommand: matchCommand, isBusy: function () { return busy; } };
})(typeof window !== 'undefined' ? window : globalThis);
