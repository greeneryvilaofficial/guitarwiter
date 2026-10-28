/* ============================================================================================
 * [LABEL SAM 3.1 + MUSE IMAGE / OFFLINE] guitarwriter.com/ai/waveform.js  (v1.5.0) -- komponen waveform
 *  - Gambar gelombang dari WAV (humming 30 dtk) di <canvas>, plus penanda nada dari native.
 *  - "SAM" lokal: segmentasi frasa (bagian bersuara dipisah jeda) -> ditumpuk di atas gelombang.
 *  - "Image" lokal: sampul album digambar langsung di canvas dari judul, kunci, tempo, suasana, dan nada lagu (PNG data-URI).
 * Tanpa jaringan sama sekali. Native memanggil window.onWaveformClick(freqHz, idx) tiap nada valid.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || G.waveform) return;

  /* ---------- [LABEL WAVEFORM / DSP MURNI] mudah diuji tanpa DOM ---------- */
  function b64ToBytes(b64) { var bin = root.atob(b64), n = bin.length, out = new Uint8Array(n); for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i); return out; }
  function parseWav(bytes) {
    if (!bytes || bytes.length < 44 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF') return null;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var rate = dv.getUint32(24, true), bits = dv.getUint16(34, true), len = dv.getUint32(40, true);
    if (bits !== 16 || !rate) return null;
    len = Math.min(len, bytes.length - 44); var n = len >> 1, s = new Int16Array(n);
    for (var i = 0; i < n; i++) s[i] = dv.getInt16(44 + 2 * i, true);
    return { rate: rate, samples: s };
  }
  function computePeaks(samples, columns) {
    var out = new Float32Array(columns * 2), per = Math.max(1, Math.floor(samples.length / columns));
    for (var c = 0; c < columns; c++) {
      var mn = 0, mx = 0, a = c * per, b = Math.min(samples.length, a + per);
      for (var i = a; i < b; i++) { var v = samples[i] / 32768; if (v < mn) mn = v; if (v > mx) mx = v; }
      out[2 * c] = mn; out[2 * c + 1] = mx;
    }
    return out;
  }
  function freqToName(f) { var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], m = Math.round(12 * Math.log2(f / 440) + 69); return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

  /* ---------- [LABEL SAM / SEGMENTASI LOKAL] frasa = rentang bersuara; jeda < 0,3 dtk digabung; frasa < 0,4 dtk dibuang ---------- */
  function segmentPhrases(samples, rate) {
    var hop = 512, frames = Math.floor(samples.length / hop), rms = [], mx = 0, i, k;
    for (i = 0; i < frames; i++) { var e = 0; for (k = 0; k < hop; k += 4) e += samples[i * hop + k] * samples[i * hop + k]; var r = Math.sqrt(e / (hop / 4)); rms.push(r); if (r > mx) mx = r; }
    var gate = Math.max(150, 0.15 * mx), runs = [], cur = null;
    for (i = 0; i < frames; i++) {
      if (rms[i] >= gate) { if (cur) cur.b = i; else cur = { a: i, b: i }; }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    var merged = [], gapF = Math.ceil(0.3 * rate / hop);
    runs.forEach(function (r2) { var last = merged[merged.length - 1]; if (last && r2.a - last.b <= gapF) last.b = r2.b; else merged.push({ a: r2.a, b: r2.b }); });
    var out = []; merged.forEach(function (r3) {
      var start = r3.a * hop / rate, end = (r3.b + 1) * hop / rate; if (end - start < 0.4) return;
      out.push({ start: +start.toFixed(2), end: +end.toFixed(2), label: 'Frasa ' + (out.length + 1) });
    });
    return out;
  }

  /* ---------- [LABEL IMAGE / SAMPUL LOKAL] gambar di canvas, deterministik per judul ---------- */
  var PAL = {
    galau: ['#0b132b', '#1c2541', '#5bc0be', '#6fffe9'], ceria: ['#ff7b00', '#ff006e', '#ffbe0b', '#fff3b0'], bluesy: ['#0a1931', '#185adb', '#ffc947', '#f5f0e1'],
    rock: ['#111111', '#e63946', '#f1faee', '#a8dadc'], akustik: ['#3d2b1f', '#a47148', '#e9c46a', '#f4a261'], lagu: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'],
    latihan: ['#023047', '#219ebc', '#8ecae6', '#ffb703'], blues: ['#0a1931', '#185adb', '#ffc947', '#f5f0e1']
  };
  function palette(mood) { return PAL[mood] || PAL.lagu; }
  function seedOf(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function wrapTitle(t) {
    t = String(t || 'Tanpa Judul').replace(/\s*\((?:[^)]*)\)\s*$/, ''); if (t.length <= 18) return [t];
    var words = t.split(' '), a = '', b = ''; words.forEach(function (w) { if ((a + ' ' + w).trim().length <= 18 && !b) a = (a + ' ' + w).trim(); else b = (b + ' ' + w).trim(); });
    return [a, b.slice(0, 22)].filter(Boolean);
  }
  /** spec: {title, key, tempo, mood, notes:[midi...]}. ctx: CanvasRenderingContext2D. Menggambar penuh w x h. */
  function drawCover(ctx, w, h, spec) {
    var pal = palette(spec.mood), r = rng(seedOf(String(spec.title) + String(spec.key) + String(spec.tempo))), i;
    var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2; var cx = w * (0.35 + 0.3 * r()), cy = h * 0.62;                       // riak suara
    for (i = 1; i <= 9; i++) { ctx.globalAlpha = 0.5 - i * 0.045; ctx.strokeStyle = pal[2 + (i % 2)]; ctx.beginPath(); ctx.arc(cx, cy, i * w * 0.055, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 0.55; ctx.strokeStyle = pal[3]; ctx.lineWidth = 1.5;                    // 6 senar
    for (i = 0; i < 6; i++) { var y = h * 0.52 + i * h * 0.035; ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(w * 0.5, y + (r() - 0.5) * h * 0.04, w, y); ctx.stroke(); }
    var notes = (spec.notes || []).filter(function (m) { return m >= 40 && m <= 83; }), bars = Math.min(48, notes.length || 32), bw = w / bars;   // batang tinggi nada
    for (i = 0; i < bars; i++) {
      var m = notes.length ? notes[Math.floor(i * notes.length / bars)] : 50 + Math.floor(r() * 20), hh = (0.08 + 0.26 * (m - 40) / 43) * h;
      ctx.globalAlpha = 0.85; ctx.fillStyle = pal[2 + (i % 2)]; ctx.fillRect(i * bw + bw * 0.12, h - hh, bw * 0.76, hh);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = pal[3]; ctx.textAlign = 'center';
    var lines = wrapTitle(spec.title); ctx.font = 'bold ' + Math.round(w * 0.085) + 'px sans-serif';
    lines.forEach(function (ln, k) { ctx.fillText(ln, w / 2, h * 0.16 + k * w * 0.1); });
    ctx.font = Math.round(w * 0.042) + 'px sans-serif'; ctx.globalAlpha = 0.9; ctx.fillText((spec.key ? spec.key + ' \u00B7 ' : '') + (spec.tempo || '') + ' bpm', w / 2, h * 0.16 + lines.length * w * 0.1 + w * 0.02);
    ctx.globalAlpha = 0.6; ctx.font = Math.round(w * 0.03) + 'px sans-serif'; ctx.fillText('GuitarWiter', w / 2, h - h * 0.015);
    ctx.globalAlpha = 1;
  }
  /** Tab (atau spec) -> {ok, data:{src:'data:image/png;base64,...'}}. Butuh <canvas> (WebView ada). */
  function makeCover(tabOrSpec, size) {
    var t = tabOrSpec || G.tab.get(); if (!t) return { ok: false, error: 'no-active-tab' };
    var spec = { title: t.title || 'Lagu Saya', key: t.key, tempo: t.tempo, mood: (t.meta && t.meta.mood) || t.mood, notes: t.notes ? t.notes.map(function (n) { return G.OPEN[n.s] + n.f; }) : t.notes };
    try {
      var c = root.document.createElement('canvas'); c.width = c.height = size || 480;
      var ctx = c.getContext('2d'); if (!ctx) return { ok: false, error: 'no-canvas' };
      drawCover(ctx, c.width, c.height, spec); return { ok: true, data: { src: c.toDataURL('image/png') } };
    } catch (e) { return { ok: false, error: 'no-canvas' }; }
  }

  /* ---------- [LABEL WAVEFORM / KOMPONEN] ---------- */
  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext && canvas.getContext('2d'), state = { wav: null, segments: [], marks: [] }, color = opts.color || '#4fc3f7';
    function draw() {
      if (!ctx) return;
      var w = canvas.width, h = canvas.height, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      var dur = state.wav ? state.wav.samples.length / state.wav.rate : 0;
      state.segments.forEach(function (sg, i) {
        if (!dur) return; var x0 = sg.start / dur * w, x1 = sg.end / dur * w;
        ctx.fillStyle = i % 2 ? 'rgba(255,193,7,.18)' : 'rgba(76,175,80,.18)'; ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
        ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif'; ctx.fillText(String(sg.label || ''), x0 + 2, 10);
      });
      if (state.wav) { var pk = computePeaks(state.wav.samples, w); ctx.fillStyle = color; for (var x = 0; x < w; x++) { var a = pk[2 * x], b = pk[2 * x + 1]; ctx.fillRect(x, mid - b * mid, 1, Math.max(1, (b - a) * mid)); } }
      state.marks.forEach(function (m) { ctx.fillStyle = '#ff7043'; ctx.fillRect(m.x * w, 0, 2, h); });
    }
    return {
      setWavBase64: function (b64) {
        var wav = null; try { wav = parseWav(b64ToBytes(b64)); } catch (e) {}
        if (!wav) return { ok: false, error: 'bad-wav' };
        state.wav = wav; state.segments = []; state.marks = []; draw(); return { ok: true, seconds: wav.samples.length / wav.rate };
      },
      mark: function (freq, rel) { state.marks.push({ x: rel == null ? 1 : rel, freq: freq, name: freqToName(freq) }); if (state.marks.length > 200) state.marks.shift(); draw(); },
      /** "SAM" lokal: frasa dari rekaman yang sedang ditampilkan. */
      segment: function () {
        if (!state.wav) return { ok: false, error: 'no-audio' };
        state.segments = segmentPhrases(state.wav.samples, state.wav.rate); draw();
        return state.segments.length ? { ok: true, data: state.segments } : { ok: false, error: 'no-melody' };
      },
      setColor: function (c) { if (/^#[0-9a-fA-F]{3,8}$|^rgba?\([\d\s.,%]+\)$/.test(String(c))) { color = String(c); draw(); } },   // warna gelombang mengikuti tema keyboard
      clear: function () { state.wav = null; state.segments = []; state.marks = []; draw(); },
      state: state, redraw: draw
    };
  }

  G.waveform = { create: create, makeCover: makeCover, _pure: { parseWav: parseWav, computePeaks: computePeaks, freqToName: freqToName, b64ToBytes: b64ToBytes, segmentPhrases: segmentPhrases, drawCover: drawCover, palette: palette, wrapTitle: wrapTitle } };
})(typeof window !== 'undefined' ? window : globalThis);
