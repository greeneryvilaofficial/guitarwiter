/* ============================================================================================
 * [LABEL AI-CORE] guitarwriter.com/ai/ai-core.js  (v1.4.0)
 * Inti bersama untuk semua fitur AI: konfigurasi, pemanggil HTTP aman, model tab + validasi.
 *
 * PENTING (baca):
 *  - Tidak ada alamat endpoint / nama model resmi yang dikarang di sini. Isi sendiri lewat
 *    GWAI.setConfig({...}) atau lewat proxy milik Anda. Selama baseUrl kosong, semua fungsi AI
 *    mengembalikan {ok:false, error:'not-configured'} dan TIDAK melakukan apa pun.
 *  - "Kontrak" request/respons di tiap modul adalah kontrak ADAPTOR ini, bukan spesifikasi resmi
 *    vendor. Kalau format API aslinya beda, pasang GWAI.hooks.<layanan>.mapRequest / mapResponse.
 *  - Jangan menaruh kunci API produksi di aplikasi klien (bisa diekstrak dari APK). Pakai proxy
 *    server sendiri yang menyimpan kunci; di klien cukup baseUrl proxy (+ token pendek bila perlu).
 *  - Tidak pernah melempar error ke aplikasi: semua fungsi mengembalikan {ok, data|error}.
 * ============================================================================================ */
(function (root) {
  'use strict';
  if (root.GWAI) return;                                     // sudah dimuat -> jangan timpa

  var CFG_KEY = 'gwai_cfg_v1';
  var SERVICES = ['spark', 'wonder', 'sam', 'image'];        // Muse Spark, Muse Wonder, SAM 3.1, Muse Image
  var DEFAULT_SERVICE = { baseUrl: '', path: '', apiKey: '', keyStorage: '', model: '', headers: {}, timeoutMs: 30000 };

  var cfg = { services: {} };
  SERVICES.forEach(function (n) { cfg.services[n] = Object.assign({}, DEFAULT_SERVICE); });
  cfg.services.wonder.timeoutMs = 20000;                     // per-permintaan (job di-poll terpisah)
  cfg.services.image.timeoutMs = 60000;
  try { var saved = JSON.parse(root.localStorage.getItem(CFG_KEY) || '{}'); mergeCfg(saved); } catch (e) {}

  function mergeCfg(p) {
    if (!p || !p.services) return;
    SERVICES.forEach(function (n) { if (p.services[n]) Object.assign(cfg.services[n], p.services[n]); });
  }
  function persist() { try { root.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }

  /* ---------- [LABEL AI-CORE / HTTP] satu pintu keluar untuk semua layanan ---------- */
  var hooks = { spark: {}, wonder: {}, sam: {}, image: {} };

  function enabled(name) { var s = cfg.services[name]; return !!(s && s.baseUrl); }

  function call(name, payload, opts) {
    opts = opts || {};
    var s = cfg.services[name];
    if (!s) return Promise.resolve({ ok: false, error: 'unknown-service' });
    if (!s.baseUrl) return Promise.resolve({ ok: false, error: 'not-configured' });
    var fetchFn = root.fetch;
    if (typeof fetchFn !== 'function') return Promise.resolve({ ok: false, error: 'no-fetch' });

    var h = hooks[name] || {};
    var path = opts.path != null ? opts.path : s.path;
    var url = s.baseUrl.replace(/\/+$/, '') + (path ? (path.charAt(0) === '/' ? path : '/' + path) : '');
    var method = opts.method || 'POST';
    var headers = Object.assign({}, s.headers);
    var key = s.apiKey;
    if (!key && s.keyStorage) { try { key = root.localStorage.getItem(s.keyStorage) || ''; } catch (e) {} }   // mis. 'meta_key'
    if (key) headers['Authorization'] = 'Bearer ' + key;
    var init = { method: method, headers: headers };
    if (method !== 'GET') {
      var isForm = typeof root.FormData !== 'undefined' && payload instanceof root.FormData;
      var body = h.mapRequest ? h.mapRequest(payload, opts) : payload;
      if (isForm || (typeof root.Blob !== 'undefined' && body instanceof root.Blob)) { init.body = body; }
      else { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    }
    var ctl = typeof root.AbortController !== 'undefined' ? new root.AbortController() : null;
    if (ctl) init.signal = ctl.signal;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeoutMs || s.timeoutMs) : null;

    return fetchFn(url, init).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) return { ok: false, error: 'http-' + res.status };
      return res.json().then(function (j) {
        return { ok: true, data: h.mapResponse ? h.mapResponse(j) : j };
      }, function () { return { ok: false, error: 'bad-json' }; });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
    });
  }

  /* ---------- [LABEL AI-CORE / MODEL TAB] format tab yang dipakai Spark & Wonder ----------
   * tab = { v:1, title, tempo:40..240, key:'E', notes:[{ t:<ketukan mulai>, d:<durasi ketukan>,
   *         s:<senar 1..6, 1 = e tinggi>, f:<fret 0..24> }] }
   * Senar standar (MIDI): s6=40(E2) s5=45 s4=50 s3=55 s2=59 s1=64(E4).  MIDI = open[s] + f.
   * Rentang tuts keyboard = MIDI 40..83 (E2..B5). */
  var OPEN = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
  var MAX_NOTES = 6000, MAX_BEATS = 1200, MIN_MIDI = 40, MAX_MIDI = 83;

  function midiOf(s, f) { return OPEN[s] + f; }

  function validateTab(raw) {
    var t = raw;
    if (typeof t === 'string') { try { t = JSON.parse(stripFence(t)); } catch (e) { return { ok: false, error: 'tab-not-json' }; } }
    if (!t || typeof t !== 'object' || !Array.isArray(t.notes)) return { ok: false, error: 'tab-shape' };
    var tempo = Number(t.tempo); if (!(tempo >= 40 && tempo <= 240)) tempo = 100;
    var out = [], dropped = 0;
    for (var i = 0; i < t.notes.length && out.length < MAX_NOTES; i++) {
      var n = t.notes[i] || {};
      var s = Math.round(Number(n.s)), f = Math.round(Number(n.f)), st = Number(n.t), d = Number(n.d);
      var okN = s >= 1 && s <= 6 && f >= 0 && f <= 24 && st >= 0 && st <= MAX_BEATS && d > 0 && d <= 32;
      if (okN) { var m = midiOf(s, f); okN = m >= MIN_MIDI && m <= MAX_MIDI; }
      if (okN) out.push({ t: +st.toFixed(4), d: +d.toFixed(4), s: s, f: f }); else dropped++;
    }
    if (!out.length) return { ok: false, error: 'tab-empty' };
    out.sort(function (a, b) { return a.t - b.t || b.s - a.s; });
    var ts = Array.isArray(t.timeSig) && t.timeSig.length === 2 ? [Math.max(1, t.timeSig[0] | 0), Math.max(1, t.timeSig[1] | 0)] : [4, 4];
    return { ok: true, data: { v: 1, title: String(t.title || '').slice(0, 80), tempo: tempo, key: String(t.key || '').slice(0, 8), timeSig: ts, notes: out }, dropped: dropped };
  }
  function stripFence(s) { return String(s).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim(); }
  function tabSeconds(tab) {
    var end = 0; tab.notes.forEach(function (n) { if (n.t + n.d > end) end = n.t + n.d; });
    return end * 60 / tab.tempo;
  }

  /* ---------- [LABEL AI-CORE / TAB AKTIF] penampung tab + undo + event, tidak menyentuh keyboard ----------
   * Aplikasi lain bisa menggantinya: definisikan window.GWTab = {get(), set(tab)} SEBELUM ai-core dimuat. */
  var _tab = null, _undo = [];
  var store = root.GWTab || {
    get: function () { return _tab; },
    set: function (t) { _tab = t; }
  };
  function emit(type, detail) {
    try { if (root.document && root.CustomEvent) root.document.dispatchEvent(new root.CustomEvent(type, { detail: detail })); } catch (e) {}
  }
  function setTab(tab, why) {
    var v = validateTab(tab); if (!v.ok) return v;
    var prev = store.get(); if (prev) { _undo.push(prev); if (_undo.length > 20) _undo.shift(); }
    store.set(v.data); emit('gw:tab-changed', { tab: v.data, why: why || 'manual' });
    return v;
  }
  function undoTab() {
    if (!_undo.length) return { ok: false, error: 'nothing-to-undo' };
    var t = _undo.pop(); store.set(t); emit('gw:tab-changed', { tab: t, why: 'undo' }); return { ok: true, data: t };
  }

  /* ---------- [LABEL AI-CORE / TAMPILAN TAB ASCII] 6 baris e B G D A E, grid 1/8 ketukan ---------- */
  function toAscii(tab) {
    if (!tab || !tab.notes) return '';
    var step = 0.5, cols = 0;                                  // 1 kolom = 0,5 ketukan (not 1/8 nada)
    tab.notes.forEach(function (n) { var c = Math.round(n.t / step); if (c + 1 > cols) cols = c + 1; });
    var names = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' }, rows = {}, s;
    for (s = 1; s <= 6; s++) { rows[s] = []; for (var i = 0; i < cols; i++) rows[s].push('---'); }
    tab.notes.forEach(function (n) {
      var c = Math.round(n.t / step), f = String(n.f);
      rows[n.s][c] = f.length === 1 ? '-' + f + '-' : f.length === 2 ? f + '-' : f.slice(0, 3);
    });
    var lines = [];
    for (s = 1; s <= 6; s++) lines.push(names[s] + '|' + rows[s].join('') + '|');
    return lines.join('\n');
  }
  // Riff E-minor pentatonic (kunci E, 90 bpm) untuk percobaan saat belum ada tab aktif.
  function sampleTab() {
    var seq = [[6,0],[6,3],[5,0],[5,2],[4,0],[4,2],[3,0],[4,2]], notes = [];
    seq.forEach(function (x, i) { notes.push({ t: i * 0.5, d: 0.5, s: x[0], f: x[1] }); });
    return { v: 1, title: 'Riff contoh', tempo: 90, key: 'E', timeSig: [4, 4], notes: notes };
  }
  // Pulihkan tab terakhir (disimpan sebagai JSON di localStorage 'lastTab'); yang bukan JSON valid diabaikan.
  try { var lt = validateTab(root.localStorage.getItem('lastTab')); if (lt.ok && !_tab) _tab = lt.data; } catch (e) {}
  if (!root.GWTab) {   // hanya pada penampung bawaan; penampung buatan aplikasi lain tidak kita ubah
    var _origSet = store.set;
    store.set = function (t) { _origSet(t); try { root.localStorage.setItem('lastTab', JSON.stringify(t)); } catch (e) {} };
  }

  root.GWAI = {
    version: '1.4.0',
    SERVICES: SERVICES, hooks: hooks, enabled: enabled, call: call,
    setConfig: function (p) { mergeCfg(p); persist(); },
    // Nilai bawaan dari aplikasi: hanya mengisi field yang masih KOSONG, tidak menimpa pilihan pengguna, tidak disimpan.
    setDefaults: function (p) {
      if (!p || !p.services) return;
      SERVICES.forEach(function (n) { var d = p.services[n]; if (!d) return; Object.keys(d).forEach(function (k) {
        var cur = cfg.services[n][k]; if (cur === '' || cur == null) cfg.services[n][k] = d[k]; }); });
    },
    getConfig: function () {
      var c = JSON.parse(JSON.stringify(cfg));
      SERVICES.forEach(function (n) { if (c.services[n].apiKey) c.services[n].apiKey = '***'; });
      return c;
    },
    tab: { validate: validateTab, midiOf: midiOf, seconds: tabSeconds, get: function () { return store.get(); }, set: setTab, undo: undoTab, toAscii: toAscii, sample: sampleTab },
    emit: emit
  };
})(typeof window !== 'undefined' ? window : globalThis);
