/* ============================================================================================
 * [LABEL MUSE SPARK / OFFLINE] guitarwriter.com/ai/editor.js  (v1.5.0)
 * "Spark" versi lokal, TANPA API:
 *   1) run("bikin lebih bluesy") -> perintah bahasa Indonesia/Inggris diubah jadi transformasi musik pada tab aktif
 *      (bluesy, galau, ceria, rock, fingerstyle, cepat, lambat, naik/turun nada, ulang).
 *   2) fromChords("Em C G D")    -> lagu lengkap: tab gitar ~2-3 menit, lirik berbahasa Indonesia + akor, tab bass & drum.
 * Semuanya fungsi murni + teori musik (music.js). Hasil selalu lewat GWAI.tab.set (validasi penuh + undo + event).
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || !G.songgen || !G.lyrics || G.editor) return;
  var M = G.music, S = G.songgen, OPEN = G.OPEN, MAXN = 6000;

  /* ---------- [LABEL SPARK / UTIL] tab <-> daftar nada MIDI ---------- */
  function bpbOf(tab) { var ts = tab.timeSig || [4, 4]; return ts[0] * 4 / ts[1]; }
  function endBeat(notes) { var e = 0; notes.forEach(function (n) { if (n.t + n.d > e) e = n.t + n.d; }); return e; }
  function fit(m) { while (m > 83) m -= 12; while (m < 40) m += 12; return m; }
  function toMidi(tab) { return tab.notes.map(function (n) { var o = { t: n.t, d: n.d, m: OPEN[n.s] + n.f }; if (n.x) o.x = n.x; return o; }); }
  function copyMeta(tab) { return tab.meta ? JSON.parse(JSON.stringify(tab.meta)) : undefined; }

  /** daftar nada MIDI -> nada tab (senar/fret) dekat posisi tangan, tanpa tumpang tindih senar; teknik x diperiksa kelayakannya. */
  function fromMidi(list) {
    var occ = new S._Occ(), out = [], hand = 5;
    list.slice().sort(function (a, b) { return a.t - b.t || b.m - a.m; }).forEach(function (n) {
      var m = fit(n.m), p = M.bestPos(m, hand, function (s) { return !occ.free(s, n.t, n.d); });
      if (!p) return;
      occ.take(p.s, n.t, n.d);
      var o = { t: +n.t.toFixed(4), d: +Math.max(0.125, n.d).toFixed(4), s: p.s, f: p.f };
      if (n.x) { if (n.x === 'b' && !(p.s <= 4 && p.f >= 2)) o.x = '~'; else o.x = n.x; }
      out.push(o); if (p.f > 0) hand = p.f;
    });
    return out;
  }
  function ornament(notes) {                                         // hammer-on / pull-off pada nada 8th beruntun di senar yang sama
    var by = {}; notes.forEach(function (n) { (by[n.s] = by[n.s] || []).push(n); });
    Object.keys(by).forEach(function (s) {
      var a = by[s].sort(function (x, y) { return x.t - y.t; });
      for (var i = 0; i + 1 < a.length; i++) {
        var c = a[i], nx = a[i + 1], df = nx.f - c.f;
        if (!c.x && c.d <= 0.5 && Math.abs(nx.t - (c.t + c.d)) < 1e-3 && Math.abs(df) >= 1 && Math.abs(df) <= 4 && c.f > 0) c.x = df > 0 ? 'h' : 'p';
      }
    });
  }
  function context(tab) {
    var notes = toMidi(tab), w = new Array(12).fill(0.05);
    notes.forEach(function (n) { w[n.m % 12] += n.d; });
    var k = M.keyFromName(tab.key) || M.detectKey(w);
    return { tab: tab, notes: notes, tempo: tab.tempo, key: k, title: tab.title, mood: tab.meta && tab.meta.mood, bpb: bpbOf(tab), applied: [] };
  }
  function relOf(m, key) { return (m % 12 - key.root + 12) % 12; }
  function barChords(ctx) {                                          // akor diatonik per birama untuk bass/pad
    var bars = Math.max(1, Math.ceil(endBeat(ctx.notes) / ctx.bpb - 1e-6));
    return M.harmonize(ctx.notes, bars, ctx.bpb, ctx.key);
  }
  function lowRoot(pc) { return 40 + ((pc - 40 % 12 + 12) % 12); }   // 40..51
  function shrink(ctx, factor) {                                     // ubah durasi tanpa melewati nada berikutnya
    var onsets = ctx.notes.map(function (n) { return n.t; }).sort(function (a, b) { return a - b; });
    ctx.notes.forEach(function (n) {
      var next = null; for (var i = 0; i < onsets.length; i++) if (onsets[i] > n.t + 1e-6) { next = onsets[i]; break; }
      var nd = n.d * factor; if (next !== null) nd = Math.min(nd, next - n.t); n.d = Math.max(0.25, nd);
    });
  }

  /* ---------- [LABEL SPARK / GAYA] tiap gaya = satu transformasi ---------- */
  var STYLES = {
    bluesy: function (ctx) {
      var root = ctx.key.root, bpb = ctx.bpb, endB = endBeat(ctx.notes);
      ctx.notes.forEach(function (n) {
        var before = n.m; n.m = M.snapMidi(n.m, root, 'blues');
        var rel = relOf(n.m, ctx.key), frac = n.t - Math.floor(n.t);
        if (Math.abs(frac - 0.5) < 0.01) { n.t += 1 / 6; n.d = Math.max(0.25, n.d - 1 / 6); }       // swing: 8th off-beat digeser ke triplet
        if ((rel === 3 || rel === 6 || rel === 10) && n.d >= 0.5) n.x = 'b';                          // not biru -> bend
        else if (n.d >= 1.5 && !n.x) n.x = '~';                                                         // nada panjang -> vibrato
        if (before !== n.m && !n.x && n.d >= 0.5) n.x = n.x || undefined;
      });
      var base = 48 + ((root - 48 % 12 + 12) % 12); if (base < 52) base += 12;               // turnaround: lick blues turun + akhir di tonika
      var start = Math.ceil(endB / bpb - 1e-6) * bpb;
      [12, 10, 7, 6, 5, 3].forEach(function (st, k) { ctx.notes.push({ t: start + k * 0.5, d: 0.5, m: base + st }); });
      ctx.notes.push({ t: start + 3, d: Math.max(1, bpb - 3), m: base, x: '~' });
      ctx.title += ' (Bluesy)'; ctx.mood = 'bluesy'; ctx.orn = true;
    },
    galau: function (ctx) {
      ctx.notes.forEach(function (n) { var r = relOf(n.m, ctx.key); if (ctx.key.mode === 'major' && (r === 4 || r === 9 || r === 11)) n.m -= 1; });   // major -> minor
      if (ctx.key.mode === 'major') { ctx.key = { root: ctx.key.root, mode: 'minor', name: M.NAMES[ctx.key.root] + 'm' }; }
      ctx.tempo = Math.max(50, Math.round(ctx.tempo * 0.85)); shrink(ctx, 1.15);
      var bars = Math.max(1, Math.ceil(endBeat(ctx.notes) / ctx.bpb - 1e-6)), ch = M.harmonize(ctx.notes, bars, ctx.bpb, ctx.key);   // pad bass akor
      ch.forEach(function (c, i) { ctx.notes.push({ t: i * ctx.bpb, d: ctx.bpb, m: lowRoot(c.root) }); });
      ctx.notes.forEach(function (n) { if (n.d >= 1.5 && !n.x && n.m > 52) n.x = '~'; });
      ctx.title += ' (Galau)'; ctx.mood = 'galau';
    },
    ceria: function (ctx) {
      ctx.notes.forEach(function (n) { var r = relOf(n.m, ctx.key); if (ctx.key.mode === 'minor' && (r === 3 || r === 8 || r === 10)) n.m += 1; });   // minor -> major
      if (ctx.key.mode === 'minor') { var r2 = (ctx.key.root + 3) % 12; ctx.key = { root: r2, mode: 'major', name: M.NAMES[r2] }; }
      ctx.tempo = Math.min(200, Math.round(ctx.tempo * 1.15)); shrink(ctx, 0.85);
      ctx.title += ' (Ceria)'; ctx.mood = 'ceria';
    },
    rock: function (ctx) {
      var at = {}; ctx.notes.forEach(function (n) { at[n.t] = (at[n.t] || 0) + 1; });
      var extra = []; ctx.notes.forEach(function (n) { if (at[n.t] === 1 && n.d >= 0.5 && n.m <= 76) extra.push({ t: n.t, d: n.d, m: n.m - 5 }); });   // power chord: kuint di bawah
      ctx.notes = ctx.notes.concat(extra.map(function (e) { e.m = fit(e.m); return e; }));
      ctx.tempo = Math.min(220, Math.round(ctx.tempo * 1.05)); ctx.title += ' (Rock)'; ctx.mood = 'rock'; ctx.orn = true;
    },
    fingerstyle: function (ctx) {
      var ch = barChords(ctx), bpb = ctx.bpb;
      ch.forEach(function (c, i) {
        var r = lowRoot(c.root), fifth = r + 7 > 52 ? r - 5 : r + 7;
        ctx.notes.push({ t: i * bpb, d: bpb >= 4 ? 1.5 : 1, m: r });
        ctx.notes.push({ t: i * bpb + (bpb >= 4 ? 2 : 1.5), d: bpb >= 4 ? 1.5 : 1.5, m: fifth });
      });
      ctx.title += ' (Fingerstyle)'; ctx.mood = 'akustik';
    },
    cepat: function (ctx) { ctx.tempo = Math.min(240, Math.round(ctx.tempo * 1.2)); },
    lambat: function (ctx) { ctx.tempo = Math.max(40, Math.round(ctx.tempo * 0.8)); },
    naik: function (ctx, n) { transpose(ctx, +n); },
    turun: function (ctx, n) { transpose(ctx, -n); },
    ulang: function (ctx) {
      var len = Math.ceil(endBeat(ctx.notes) / ctx.bpb - 1e-6) * ctx.bpb, copy = ctx.notes.map(function (n) { var o = JSON.parse(JSON.stringify(n)); o.t += len; return o; });
      if (ctx.notes.length + copy.length <= MAXN) { ctx.notes = ctx.notes.concat(copy); ctx.repeatShift = len; }
    }
  };
  function transpose(ctx, n) {
    ctx.notes.forEach(function (x) { x.m += n; });
    var r = (ctx.key.root + n + 120) % 12; ctx.key = { root: r, mode: ctx.key.mode, name: M.NAMES[r] + (ctx.key.mode === 'minor' ? 'm' : '') };
  }

  /* ---------- [LABEL SPARK / PENAFSIR PERINTAH] kata kunci Indonesia + Inggris ---------- */
  var KEYS = [
    ['galau', /\b(galau|sedih|melankolis|melankoli|baper|sendu|pilu|sad|mellow|melancholy)\b/],
    ['ceria', /\b(ceria|happy|semangat|riang|gembira|upbeat|bahagia|senang|cheerful)\b/],
    ['bluesy', /\b(blues|bluesy|blus)\b/],
    ['rock', /\b(rock|rok|distorsi|garang|metal|punk)\b/],
    ['fingerstyle', /\b(fingerstyle|akustik|acoustic|arpeggio|arpegio|lembut)\b/],
    ['cepat', /\b(cepat|cepetin|percepat|faster|speed|ngebut|kencang)\b/],
    ['lambat', /\b(lambat|pelan|pelankan|perlambat|lambatin|slower|slow)\b/],
    ['naik', /\b(naik|naikin|naikkan|higher|transpose up|nada tinggi)\b/],
    ['turun', /\b(turun|turunin|turunkan|lower|transpose down|nada rendah)\b/],
    ['ulang', /\b(ulang|ulangi|repeat|double|perpanjang|panjangin|dua kali)\b/]
  ];
  var NUM = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, setengah: 1, one: 1, two: 2, three: 3, four: 4 };
  function parse(text) {
    var t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9#\s]/g, ' ') + ' ', found = [], mood = null;
    KEYS.forEach(function (k) {
      var m = k[1].exec(t); if (!m) return;
      if (k[0] === 'galau' || k[0] === 'ceria') { if (mood && mood.pos < m.index) return; mood = { name: k[0], pos: m.index }; return; }   // dua suasana: yang muncul pertama
      found.push({ name: k[0], pos: m.index });
    });
    if (mood) found.push(mood);
    var n = 2, mm = /(\d+)\s*(?:nada|semiton|semitone|step|tone)/.exec(t) || /\b(satu|dua|tiga|empat|lima|enam|setengah|one|two|three|four)\b\s*(?:nada|semiton|semitone|step|tone)/.exec(t);
    if (mm) n = NUM[mm[1]] || parseInt(mm[1], 10) || 2; n = Math.max(1, Math.min(12, n));
    var ORDER = ['galau', 'ceria', 'bluesy', 'rock', 'fingerstyle', 'cepat', 'lambat', 'naik', 'turun', 'ulang'];
    found.sort(function (a, b) { return ORDER.indexOf(a.name) - ORDER.indexOf(b.name); });
    return { actions: found.map(function (f) { return f.name; }), n: n };
  }

  function run(text) {
    var cur = G.tab.get(); if (!cur) return { ok: false, error: 'no-active-tab' };
    var p = parse(text); if (!p.actions.length) return { ok: false, error: 'unknown-command', suggestions: suggestions() };
    var ctx = context(JSON.parse(JSON.stringify(cur))), shift = 0;
    p.actions.forEach(function (a) { STYLES[a](ctx, p.n); ctx.applied.push(a); if (a === 'ulang') shift = 1; });
    var tab = { v: 1, title: ctx.title.slice(0, 80), tempo: ctx.tempo, key: ctx.key.name, timeSig: cur.timeSig, notes: fromMidi(ctx.notes) };
    if (ctx.orn) ornament(tab.notes);
    var meta = copyMeta(cur) || {}; if (ctx.mood) meta.mood = ctx.mood;
    if (ctx.repeatShift && meta.chords) meta.chords = meta.chords.concat(meta.chords.map(function (c) { return { t: c.t + ctx.repeatShift, name: c.name }; }));
    tab.meta = meta;
    var r = G.tab.set(tab, 'spark:' + String(text).slice(0, 40));
    return r.ok ? { ok: true, data: r.data, applied: ctx.applied, dropped: r.dropped } : r;
  }
  function suggestions() { return ['bikin lebih bluesy', 'buat jadi galau', 'bikin ceria', 'jadi rock', 'versi fingerstyle', 'lebih cepat', 'lebih lambat', 'naikin 2 nada', 'turunin 3 nada', 'ulang dua kali']; }

  /* ---------- [LABEL SPARK / CHORD -> LAGU] akor + (opsional) suasana -> tab ~2-3 menit + lirik + bass + drum ---------- */
  function chartLine(chordsHere, text) {                             // baris akor di atas lirik, tersebar rata
    if (!chordsHere.length) return '';
    var width = Math.max(text.length, chordsHere.length * 6), arr = new Array(width).fill(' '), step = Math.floor(width / chordsHere.length);
    chordsHere.forEach(function (n, i) { var pos = i * step; for (var k = 0; k < n.length; k++) arr[pos + k] = n[k]; });
    return arr.join('').replace(/\s+$/, '');
  }
  function chartBlock(name, chordNames, lines) {
    var out = ['[' + name + ']'], per = Math.max(1, Math.ceil(chordNames.length / Math.max(1, lines.length)));
    if (!lines.length) { out.push(chartLine(chordNames.slice(0, 8), '')); return out.join('\n'); }
    lines.forEach(function (ln, i) { var ch = chordNames.slice(i * per, (i + 1) * per); var cl = chartLine(ch, ln); if (cl) out.push(cl); out.push(ln); });
    return out.join('\n');
  }
  function fromChords(text, opts) {
    opts = opts || {};
    var toks = String(text || '').split(/[\s,|]+/).filter(Boolean);
    if (!toks.length || toks.length > 16) return { ok: false, error: 'bad-chord', detail: toks.length ? 'maksimum 16 akor' : 'isi akor dulu, mis. Em C G D' };
    var chords = [];
    for (var i = 0; i < toks.length; i++) { var c = M.parseChord(toks[i]); if (!c) return { ok: false, error: 'bad-chord', detail: toks[i] }; chords.push(c); }
    var minor = chords.filter(function (c) { return c.q === 'min' || c.q === 'm7' || c.q === 'm7b5' || c.q === 'dim'; }).length;
    var startsMinor = chords[0].q === 'min' || chords[0].q === 'm7';          // mulai dari akor minor = kunci minor (mis. Em C G D, Am F C G)
    var mood = opts.mood === 'ceria' || opts.mood === 'galau' ? opts.mood : ((startsMinor || minor / chords.length >= 0.5) ? 'galau' : 'ceria');
    var seed = opts.seed != null ? opts.seed : G.lyrics.hash(toks.join(' ')), n = chords.length, tempo = mood === 'galau' ? 78 : 108, bpb = 4;
    function rep(k) { var o = []; for (var j = 0; j < k; j++) o = o.concat(chords); return o; }
    function secSec(list) { var bars = 0; list.forEach(function (s) { bars += s.bars.length; }); return bars * bpb * 60 / tempo; }
    var pat = mood === 'galau' ? { verse: 'arp', chorus: 'strum' } : { verse: 'strum', chorus: 'strum' };
    var plan = [{ name: 'Intro', passes: 1, pattern: 'arp' }, { name: 'Verse 1', passes: 2, pattern: pat.verse }, { name: 'Chorus', passes: 2, pattern: pat.chorus }, { name: 'Verse 2', passes: 2, pattern: pat.verse }, { name: 'Chorus', passes: 2, pattern: pat.chorus }];
    var tail = [{ name: 'Bridge', passes: 1, pattern: 'sustain' }, { name: 'Final Chorus', passes: 2, pattern: 'strum' }, { name: 'Outro', passes: 1, pattern: 'arp' }];
    var verses = 2, secs = plan.concat(tail).map(function (p) { return { name: p.name, bars: rep(p.passes), pattern: p.pattern }; });
    while (secSec(secs) < 150 && verses < 4) {                      // lagu penuh ~2,5-3 menit: tambah bait + reff sebelum bridge
      verses++; var at = secs.length - 3;
      secs.splice(at, 0, { name: 'Verse ' + verses, bars: rep(2), pattern: pat.verse }, { name: 'Chorus', bars: rep(2), pattern: pat.chorus });
    }
    var L = G.lyrics.generate(mood, seed, verses), lirik = [], vi = 0, chorusUsed = 0;
    secs.forEach(function (s) {
      var names = s.bars.map(function (c) { return c.name; }), lines = [];
      if (/^Verse/.test(s.name)) lines = L.verses[vi++ % L.verses.length];
      else if (/Chorus/.test(s.name)) { lines = L.chorus; chorusUsed++; }
      else if (s.name === 'Bridge') lines = L.bridge;
      else if (s.name === 'Outro') lines = L.outro;
      lirik.push(chartBlock(s.name, names, lines.length ? lines : []) + (lines.length ? '' : '\n(instrumental)'));
    });
    var first = chords[0], keyName = M.NAMES[first.root] + ((first.q === 'min' || first.q === 'm7') ? 'm' : '');
    var tab = S.build({ title: L.title, key: keyName, tempo: tempo, timeSig: [4, 4], mood: mood, sections: secs });
    var r = G.tab.set(tab, 'chord:' + toks.join(' ').slice(0, 40)); if (!r.ok) return r;
    return { ok: true, data: { tab: r.data, title: L.title, mood: mood, tempo: tempo, seconds: Math.round(G.tab.seconds(r.data)), seed: seed, lirik: lirik.join('\n\n'),
                               bassTab: S.bassTab(chords, mood), drumTab: S.drumTab(mood, 2), chords: toks } };
  }

  G.editor = { chart: chartBlock, run: run, parse: parse, fromChords: fromChords, suggestions: suggestions, _fromMidi: fromMidi, _toMidi: toMidi };
})(typeof window !== 'undefined' ? window : globalThis);
