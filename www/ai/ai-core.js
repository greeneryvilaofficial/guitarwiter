/* ============================================================================================
 * [LABEL AI-CORE / OFFLINE] guitarwriter.com/ai/ai-core.js  (v1.5.0)
 * Inti VERSI OFFLINE: model tab + validasi + undo + event + tampilan ASCII. TIDAK ADA jaringan sama sekali di modul AI:
 * tanpa fetch, tanpa kunci API, tanpa endpoint. Semua "Spark / Wonder / SAM / Image" dikerjakan lokal di perangkat.
 *
 * Model tab (v1, kompatibel mundur):
 *   { v:1, title, tempo:40..240, key:'Em', timeSig:[4,4],
 *     notes:[{ t:<ketukan mulai>, d:<durasi ketukan>, s:<senar 1..6, 1 = e tinggi>, f:<fret 0..24>, x?:<teknik> }],
 *     meta?:{ sections:[{t,name}], chords:[{t,name}], mood } }
 *   Teknik x: 'b' bend, '/' slide naik, '\\' slide turun, 'h' hammer-on, 'p' pull-off, '~' vibrato.
 *   Senar standar (MIDI): s6=40(E2) s5=45 s4=50 s3=55 s2=59 s1=64(E4); MIDI = open[s] + f; rentang tuts E2..B5 = 40..83.
 * ============================================================================================ */
(function (root) {
  'use strict';
  if (root.GWAI && root.GWAI.offline) return;

  var OPEN = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
  var MAX_NOTES = 6000, MAX_BEATS = 1200, MIN_MIDI = 40, MAX_MIDI = 83;
  var TECH = { 'b': 1, '/': 1, '\\': 1, 'h': 1, 'p': 1, '~': 1 };

  function midiOf(s, f) { return OPEN[s] + f; }
  function stripFence(s) { return String(s).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim(); }

  function cleanList(arr, max, fn) {
    var out = [];
    if (Array.isArray(arr)) for (var i = 0; i < arr.length && out.length < max; i++) { var v = fn(arr[i] || {}); if (v) out.push(v); }
    return out;
  }

  /* ---------- [LABEL AI-CORE / VALIDASI] satu-satunya pintu masuk tab ke aplikasi ---------- */
  function validateTab(raw) {
    var t = raw;
    if (typeof t === 'string') { try { t = JSON.parse(stripFence(t)); } catch (e) { return { ok: false, error: 'tab-not-json' }; } }
    if (!t || typeof t !== 'object' || !Array.isArray(t.notes)) return { ok: false, error: 'tab-shape' };
    var tempo = Number(t.tempo); if (!(tempo >= 40 && tempo <= 240)) tempo = 100;
    var out = [], dropped = 0;
    for (var i = 0; i < t.notes.length && out.length < MAX_NOTES; i++) {
      var n = t.notes[i] || {};
      var s = Math.round(Number(n.s)), f = Math.round(Number(n.f)), st = Number(n.t), d = Number(n.d);
      var okN = s >= 1 && s <= 6 && f >= 0 && f <= 24 && st >= 0 && st <= MAX_BEATS && d > 0 && d <= 64;
      if (okN) { var m = midiOf(s, f); okN = m >= MIN_MIDI && m <= MAX_MIDI; }
      if (okN) { var o = { t: +st.toFixed(4), d: +d.toFixed(4), s: s, f: f }; if (typeof n.x === 'string' && TECH[n.x]) o.x = n.x; out.push(o); }
      else dropped++;
    }
    if (!out.length) return { ok: false, error: 'tab-empty' };
    out.sort(function (a, b) { return a.t - b.t || b.s - a.s; });
    var ts = Array.isArray(t.timeSig) && t.timeSig.length === 2 ? [Math.min(16, Math.max(1, t.timeSig[0] | 0)), [2, 4, 8].indexOf(t.timeSig[1] | 0) >= 0 ? t.timeSig[1] | 0 : 4] : [4, 4];
    var res = { v: 1, title: String(t.title || '').slice(0, 80), tempo: tempo, key: String(t.key || '').slice(0, 8), timeSig: ts, notes: out };
    if (t.meta && typeof t.meta === 'object') {
      var meta = {};
      meta.sections = cleanList(t.meta.sections, 40, function (x) { var tt = Number(x.t); return (tt >= 0 && tt <= MAX_BEATS && x.name) ? { t: +tt.toFixed(4), name: String(x.name).slice(0, 24) } : null; });
      meta.chords = cleanList(t.meta.chords, 600, function (x) { var tt = Number(x.t); return (tt >= 0 && tt <= MAX_BEATS && x.name) ? { t: +tt.toFixed(4), name: String(x.name).slice(0, 12) } : null; });
      if (t.meta.mood) meta.mood = String(t.meta.mood).slice(0, 12);
      res.meta = meta;
    }
    return { ok: true, data: res, dropped: dropped };
  }
  function tabSeconds(tab) {
    var end = 0; tab.notes.forEach(function (n) { if (n.t + n.d > end) end = n.t + n.d; });
    return end * 60 / tab.tempo;
  }

  /* ---------- [LABEL AI-CORE / TAB ASCII] sistem per baris (garis birama, chord & bagian di atas) ----------
   * 1 kolom = 0,5 ketukan, tiap sel 3 karakter. barsPerLine bawaan 2 (~55 karakter, muat di layar HP). */
  function toAscii(tab, opts) {
    if (!tab || !tab.notes || !tab.notes.length) return '';
    opts = opts || {};
    var per = Math.max(1, opts.barsPerLine || 2), ts = tab.timeSig || [4, 4], bpb = ts[0] * 4 / ts[1], cpb = Math.max(1, Math.round(bpb * 2));
    var maxCol = 0, cells = {}, i;
    tab.notes.forEach(function (n) {
      var c = Math.round(n.t / 0.5); if (c > maxCol) maxCol = c;
      var txt = String(n.f) + (n.x || ''); if (txt.length > 3) txt = txt.slice(0, 3);
      cells[n.s + ':' + c] = txt.length === 1 ? '-' + txt + '-' : txt.length === 2 ? txt + '-' : txt;
    });
    var meta = tab.meta || {}, chords = (meta.chords || []).map(function (c) { return { col: Math.round(c.t / 0.5), name: c.name }; }),
        secs = (meta.sections || []).map(function (c) { return { col: Math.round(c.t / 0.5), name: c.name }; });
    var bars = Math.floor(maxCol / cpb) + 1, names = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' }, lines = [], barW = cpb * 3 + 1;
    function put(arr, pos, text) { for (var k = 0; k < text.length && pos + k < arr.length; k++) arr[pos + k] = text[k]; }
    function free(arr, pos, len) { for (var k = -1; k < len; k++) if (pos + k >= 0 && pos + k < arr.length && arr[pos + k] !== ' ') return false; return true; }
    for (var b0 = 0; b0 < bars; b0 += per) {
      var nb = Math.min(per, bars - b0), width = 2 + nb * barW, secLine = [], chLine = [], hasSec = false, hasCh = false, last = null;
      for (i = 0; i < width; i++) { secLine.push(' '); chLine.push(' '); }
      secs.forEach(function (sc) { var bar = Math.floor(sc.col / cpb); if (bar >= b0 && bar < b0 + nb) { hasSec = true; put(secLine, 2 + (bar - b0) * barW + (sc.col % cpb) * 3, '\u25B8 ' + sc.name); } });
      chords.forEach(function (c) {
        var bar = Math.floor(c.col / cpb); if (bar < b0 || bar >= b0 + nb) return;
        if (c.name === last) return; last = c.name;
        var pos = 2 + (bar - b0) * barW + (c.col % cpb) * 3 + 1;
        if (free(chLine, pos, c.name.length)) { hasCh = true; put(chLine, pos, c.name); }
      });
      if (hasSec) lines.push(secLine.join('').replace(/\s+$/, ''));
      if (hasCh) lines.push(chLine.join('').replace(/\s+$/, ''));
      for (var s = 1; s <= 6; s++) {
        var ln = names[s] + '|';
        for (var bb = 0; bb < nb; bb++) {
          for (var k = 0; k < cpb; k++) { var cc = cells[s + ':' + ((b0 + bb) * cpb + k)]; ln += cc || '---'; }
          ln += '|';
        }
        lines.push(ln);
      }
      lines.push('');
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }
  function sampleTab() {            // riff E-minor pentatonic untuk percobaan saat belum ada tab aktif
    var seq = [[6,0],[6,3],[5,0],[5,2],[4,0],[4,2],[3,0],[4,2]], notes = [];
    seq.forEach(function (x, i) { notes.push({ t: i * 0.5, d: 0.5, s: x[0], f: x[1] }); });
    return { v: 1, title: 'Riff contoh', tempo: 90, key: 'E', timeSig: [4, 4], notes: notes };
  }

  /* ---------- [LABEL AI-CORE / TAB AKTIF] penampung + undo + event; tidak menyentuh keyboard ---------- */
  var _tab = null, _undo = [];
  try { var lt = validateTab(root.localStorage.getItem('lastTab')); if (lt.ok) _tab = lt.data; } catch (e) {}
  var store = root.GWTab || {
    get: function () { return _tab; },
    set: function (t) { _tab = t; try { root.localStorage.setItem('lastTab', JSON.stringify(t)); } catch (e) {} }
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

  root.GWAI = {
    version: '1.5.0', offline: true, OPEN: OPEN,
    tab: { validate: validateTab, midiOf: midiOf, seconds: tabSeconds, get: function () { return store.get(); }, set: setTab, undo: undoTab, toAscii: toAscii, sample: sampleTab },
    emit: emit
  };
})(typeof window !== 'undefined' ? window : globalThis);
