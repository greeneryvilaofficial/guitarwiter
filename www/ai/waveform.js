/* ============================================================================================
 * [LABEL SAM 3.1 + MUSE IMAGE] guitarwriter.com/ai/waveform.js  (v1.4.0)  -- komponen waveform
 *  - Menggambar gelombang dari WAV (mis. humming 30 dtk) di <canvas>, dengan penanda nada dari native.
 *  - SAM 3.1 : bagi rekaman menjadi segmen (bait/reff/dll) -> ditumpuk di atas gelombang.
 *  - Muse Image: buat gambar sampul dari deskripsi -> mengembalikan URL / data-URI.
 * Native memanggil window.onWaveformClick(freqHz, idx) tiap nada valid (setelah AndroidKeyboard.setWaveformHook(true)).
 *
 * Kontrak ADAPTOR (bukan spesifikasi resmi vendor; sesuaikan lewat GWAI.hooks.sam / GWAI.hooks.image):
 *   SAM   : POST {baseUrl}{path||'/segment'} { audio:'<WAV base64>', format:'wav' }  ->  { segments:[{start,end,label}] } (detik)
 *   Image : POST {baseUrl}{path||'/generate'} { prompt }  ->  { url:'https://...' } ATAU { b64:'<png base64>' }
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || G.waveform) return;

  /* ---------- [LABEL WAVEFORM / DSP MURNI] mudah diuji tanpa DOM ---------- */
  function b64ToBytes(b64) {
    var bin = root.atob(b64), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** WAV PCM16 mono -> {rate, samples:Int16Array}; null kalau bukan WAV yang dikenal. */
  function parseWav(bytes) {
    if (!bytes || bytes.length < 44 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF') return null;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var rate = dv.getUint32(24, true), bits = dv.getUint16(34, true), len = dv.getUint32(40, true);
    if (bits !== 16 || !rate) return null;
    len = Math.min(len, bytes.length - 44); var n = len >> 1, s = new Int16Array(n);
    for (var i = 0; i < n; i++) s[i] = dv.getInt16(44 + 2 * i, true);
    return { rate: rate, samples: s };
  }
  /** Puncak min/maks per kolom piksel -> Float32Array [min0,max0,min1,max1,...] dalam -1..1 */
  function computePeaks(samples, columns) {
    var out = new Float32Array(columns * 2), per = Math.max(1, Math.floor(samples.length / columns));
    for (var c = 0; c < columns; c++) {
      var mn = 0, mx = 0, a = c * per, b = Math.min(samples.length, a + per);
      for (var i = a; i < b; i++) { var v = samples[i] / 32768; if (v < mn) mn = v; if (v > mx) mx = v; }
      out[2 * c] = mn; out[2 * c + 1] = mx;
    }
    return out;
  }
  function freqToName(f) {
    var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], m = Math.round(12 * Math.log2(f / 440) + 69);
    return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }

  /* ---------- [LABEL WAVEFORM / KOMPONEN] ---------- */
  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext && canvas.getContext('2d'), state = { wav: null, b64: '', segments: [], marks: [] }, color = opts.color || '#4fc3f7';
    function draw() {
      if (!ctx) return;
      var w = canvas.width, h = canvas.height, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      var dur = state.wav ? state.wav.samples.length / state.wav.rate : 0;
      state.segments.forEach(function (sg, i) {                     // lapisan SAM
        if (!dur) return; var x0 = sg.start / dur * w, x1 = sg.end / dur * w;
        ctx.fillStyle = i % 2 ? 'rgba(255,193,7,.18)' : 'rgba(76,175,80,.18)'; ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
        ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif'; ctx.fillText(String(sg.label || ''), x0 + 2, 10);
      });
      if (state.wav) {                                                // gelombang
        var pk = computePeaks(state.wav.samples, w); ctx.fillStyle = color;
        for (var x = 0; x < w; x++) { var a = pk[2 * x], b = pk[2 * x + 1]; ctx.fillRect(x, mid - b * mid, 1, Math.max(1, (b - a) * mid)); }
      }
      state.marks.forEach(function (m) { ctx.fillStyle = '#ff7043'; ctx.fillRect(m.x * w, 0, 2, h); });   // nada dari native
    }
    return {
      setWavBase64: function (b64) {
        var wav = null; try { wav = parseWav(b64ToBytes(b64)); } catch (e) {}
        if (!wav) return { ok: false, error: 'bad-wav' };
        state.wav = wav; state.b64 = b64; state.segments = []; state.marks = []; draw(); return { ok: true, seconds: wav.samples.length / wav.rate };
      },
      /** Penanda nada: posisi relatif 0..1 (default = ujung kanan, seperti rekaman berjalan). */
      mark: function (freq, rel) { state.marks.push({ x: rel == null ? 1 : rel, freq: freq, name: freqToName(freq) }); if (state.marks.length > 200) state.marks.shift(); draw(); },
      /** SAM 3.1: segmentasi rekaman -> segmen terurut & tervalidasi. */
      segment: function () {
        if (!state.b64) return Promise.resolve({ ok: false, error: 'no-audio' });
        if (!G.enabled('sam')) return Promise.resolve({ ok: false, error: 'not-configured' });
        var cfg = G.getConfig().services.sam;
        return G.call('sam', { model: cfg.model || undefined, audio: state.b64, format: 'wav' }, { path: cfg.path || '/segment' }).then(function (r) {
          if (!r.ok) return r;
          var dur = state.wav.samples.length / state.wav.rate, list = ((r.data || {}).segments || []).filter(function (s) {
            return s && isFinite(s.start) && isFinite(s.end) && s.start >= 0 && s.end > s.start && s.end <= dur + 0.5; });
          list.sort(function (a, b) { return a.start - b.start; });
          state.segments = list.map(function (s) { return { start: +s.start, end: Math.min(+s.end, dur), label: String(s.label || '').slice(0, 20) }; });
          draw(); return { ok: true, data: state.segments };
        });
      },
      clear: function () { state.wav = null; state.b64 = ''; state.segments = []; state.marks = []; draw(); },
      state: state, redraw: draw
    };
  }

  /** Muse Image: gambar sampul dari deskripsi. Hanya menerima https:// atau data:image/png (tidak ada skema lain). */
  function makeCover(prompt) {
    prompt = String(prompt || '').trim().slice(0, 300);
    if (!prompt) return Promise.resolve({ ok: false, error: 'empty-prompt' });
    if (!G.enabled('image')) return Promise.resolve({ ok: false, error: 'not-configured' });
    var cfg = G.getConfig().services.image;
    return G.call('image', { model: cfg.model || undefined, prompt: prompt }, { path: cfg.path || '/generate' }).then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {}, src = d.url ? String(d.url) : (d.b64 ? 'data:image/png;base64,' + String(d.b64).replace(/[^A-Za-z0-9+/=]/g, '') : '');
      if (!/^https:\/\//i.test(src) && !/^data:image\/png;base64,/.test(src)) return { ok: false, error: 'bad-image' };
      return { ok: true, data: { src: src } };
    });
  }

  G.waveform = { create: create, makeCover: makeCover, _pure: { parseWav: parseWav, computePeaks: computePeaks, freqToName: freqToName, b64ToBytes: b64ToBytes } };
})(typeof window !== 'undefined' ? window : globalThis);
