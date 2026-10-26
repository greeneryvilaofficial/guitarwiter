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

  /* ---------- [LABEL MUSE SPARK / CHORD -> LIRIK + TAB] ----------
   * Konvensi bahasa: kode & komentar Indonesia; HANYA prompt untuk model Meta yang berbahasa Inggris (kompatibilitas model),
   * sedangkan LIRIK yang diminta tetap Bahasa Indonesia.
   * Alur: chord -> Spark -> JSON {lyrics, bass_tab, drum_tab, tab}. Lirik/bass/drum ditampilkan, tab gitar valid langsung
   * mengganti tab aktif. Jawaban non-JSON ditolak tanpa mengubah apa pun. Gagal sementara (429/5xx/timeout/jaringan) dicoba 1x lagi. */
  var LYRIC_STYLE = 'Galau, cinta, anak Bandung';             // gaya lirik; ubah di sini
  var LYRIC_LINES = 2;                                        // jumlah baris lirik
  var CHORD_OK = /^[A-Za-z0-9#\/+\-,. ]{1,80}$/;              // hanya karakter chord; mencegah teks bebas/injeksi lewat kolom chord
  var RETRY_ERRORS = /^(http-429|http-5\d\d|timeout|network)$/;
  var RETRY_DELAY_MS = 1500;

  // --- [PROMPT UNTUK META: BAHASA INGGRIS] ---
  var CHORD_SYS =
    'You are a songwriter AI.\n' +
    'Task: write ' + LYRIC_LINES + ' lines of Indonesian lyrics for the given chord progression, plus Bass and Drum tabs.\n' +
    'Style: ' + LYRIC_STYLE + '.\n' +
    'Language output: the lyrics MUST be in Bahasa Indonesia.\n' +
    'Reply with ONLY one JSON object, no explanation and no markdown:\n' +
    '{"lyrics":"line 1\\nline 2","bass_tab":"ASCII bass tab","drum_tab":"ASCII drum tab",' +
    '"tab":{"v":1,"title":"","tempo":90,"key":"E","timeSig":[4,4],"notes":[{"t":0,"d":0.5,"s":6,"f":0}]}}\n' +
    '"tab" is the main guitar part: t = start beat, d = duration in beats, s = string 1..6 (1 = high e), f = fret 0..24, notes within E2..B5.';
  function chordPrompt(chordTerdeteksi) { return 'Input chord: ' + chordTerdeteksi; }

  function parseJson(t) {
    t = String(t || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    var i = t.indexOf('{'), j = t.lastIndexOf('}');            // model kadang menambah kalimat di sekitar JSON: ambil objeknya saja
    if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
    return null;
  }
  function str(v) { return typeof v === 'string' ? v.slice(0, 4000) : ''; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function askSpark(messages, path, attempt) {
    var cfg = G.getConfig().services.spark;
    return G.call('spark', { model: cfg.model || undefined, messages: messages }, { path: path }).then(function (r) {
      if (!r.ok && attempt < 1 && RETRY_ERRORS.test(r.error)) return sleep(RETRY_DELAY_MS).then(function () { return askSpark(messages, path, attempt + 1); });
      return r;
    });
  }

  function fromChord(chordTerdeteksi) {
    chordTerdeteksi = String(chordTerdeteksi || '').trim();
    if (!CHORD_OK.test(chordTerdeteksi)) return Promise.resolve({ ok: false, error: 'bad-chord' });
    if (!G.enabled('spark')) return Promise.resolve({ ok: false, error: 'not-configured' });
    if (busy) return Promise.resolve({ ok: false, error: 'busy' });
    busy = true; G.emit('gw:spark-start', { chord: chordTerdeteksi });
    var cfg = G.getConfig().services.spark;
    var messages = [{ role: 'system', content: CHORD_SYS }, { role: 'user', content: chordPrompt(chordTerdeteksi) }];
    return askSpark(messages, cfg.path || '/edit', 0)
      .then(function (r) {
        if (!r.ok) return r;
        var d = parseJson((r.data || {}).text);
        if (!d || typeof d !== 'object') return { ok: false, error: 'bad-answer' };
        var bass = str(d.bass_tab), drum = str(d.drum_tab);
        var band = str(d.band) || [bass ? 'Bass:\n' + bass : '', drum ? 'Drums:\n' + drum : ''].filter(Boolean).join('\n\n');
        var out = { lirik: str(d.lyrics) || str(d.lirik), band: band, tabApplied: false };
        if (d.tab != null) { var v = G.tab.validate(d.tab); if (v.ok) out.tabApplied = G.tab.set(v.data, 'spark:chord').ok; }
        if (!out.lirik && !out.band && !out.tabApplied) return { ok: false, error: 'bad-answer' };
        return { ok: true, data: out };
      })
      .then(function (res) { busy = false; G.emit('gw:spark-end', res); return res; },
            function () { busy = false; return { ok: false, error: 'unexpected' }; });
  }

  G.editor = { run: run, fromChord: fromChord, matchCommand: matchCommand, isBusy: function () { return busy; } };
})(typeof window !== 'undefined' ? window : globalThis);
