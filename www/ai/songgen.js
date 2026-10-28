/* ============================================================================================
 * [LABEL PEMBANGUN LAGU] guitarwriter.com/ai/songgen.js  (v1.5.0, OFFLINE)
 * Dari rancangan lagu (bagian + akor per birama + melodi opsional) -> tab gitar lengkap: melodi (prioritas), lalu iringan
 * (arpeggio / strum / sustain) hanya di senar yang BEBAS, plus teks tab bass & drum. Fungsi murni, tanpa jaringan.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || !G.music || G.songgen) return;
  var M = G.music, OPEN = G.OPEN;

  function Occ() { this.iv = {}; }                                // pencatat pemakaian senar: tidak ada dua nada tumpang tindih di senar yang sama
  Occ.prototype.free = function (s, t, d) { var a = this.iv[s] || []; for (var i = 0; i < a.length; i++) if (t < a[i][1] - 1e-6 && t + d > a[i][0] + 1e-6) return false; return true; };
  Occ.prototype.take = function (s, t, d) { (this.iv[s] = this.iv[s] || []).push([t, t + d]); };

  function addNote(notes, occ, s, f, t, d, x) {
    if (!occ.free(s, t, d)) return false;
    var o = { t: +t.toFixed(4), d: +d.toFixed(4), s: s, f: f }; if (x) o.x = x;
    notes.push(o); occ.take(s, t, d); return true;
  }

  /* ---------- [LABEL PEMBANGUN / POLA IRINGAN] ---------- */
  function accompany(notes, occ, chord, t0, bpb, pattern) {
    if (pattern === 'none') return;                                                  // latihan/riff: hanya melodi, tanpa iringan
    var V = M.voicing(chord).sort(function (a, b) { return b.s - a.s; });          // senar rendah -> tinggi
    if (!V.length) return;
    var lo = V.filter(function (n) { return n.s >= 4; }), hi = V.filter(function (n) { return n.s <= 3; });
    var bass = lo[0] || V[0], alt = lo[1] || bass;
    function hiAt(i) { return hi.length ? hi[Math.min(i, hi.length - 1)] : bass; }
    if (pattern === 'arp') {
      var seq = [bass, hiAt(0), hiAt(1), hiAt(2), alt, hiAt(1), hiAt(2), hiAt(1)], slots = Math.round(bpb * 2);
      for (var k = 0; k < slots; k++) { var n = seq[k % 8]; addNote(notes, occ, n.s, n.f, t0 + k * 0.5, k === 0 ? 1 : 0.5); }
    } else if (pattern === 'strum') {
      var hits = bpb === 4 ? [0, 1, 1.5, 2.5, 3, 3.5] : bpb === 3 ? [0, 1, 1.5, 2, 2.5] : (function () { var h = []; for (var b = 0; b < bpb; b++) h.push(b); return h; })();
      hits.forEach(function (h, i) {
        var down = (h % 1) === 0, pool = down ? V : V.filter(function (n) { return n.s <= 4; });
        pool.forEach(function (n) { addNote(notes, occ, n.s, n.f, t0 + h, down && i === 0 ? 1 : 0.5); });
      });
    } else {                                                                        // 'sustain': akor ditahan satu birama
      V.forEach(function (n) { addNote(notes, occ, n.s, n.f, t0, bpb); });
    }
  }

  /* ---------- [LABEL PEMBANGUN / BANGUN TAB] ----------
   * spec = { title, key, tempo, timeSig, mood, sections:[{ name, bars:[chordObj], pattern, lead:[{t,d,m,x?}] }] }
   * lead.t relatif terhadap awal bagian (ketukan); melodi di luar panjang bagian dipotong. */
  function build(spec) {
    var ts = spec.timeSig || [4, 4], bpb = ts[0] * 4 / ts[1], notes = [], meta = { sections: [], chords: [] }, occ = new Occ(), t0 = 0;
    spec.sections.forEach(function (sec) {
      var nb = sec.bars.length, len = nb * bpb, hand = 5;
      meta.sections.push({ t: t0, name: sec.name });
      (sec.lead || []).slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (n) {
        if (n.t >= len - 1e-6) return;
        var d = Math.min(n.d, len - n.t), t = t0 + n.t;
        var p = (n.s && n.f != null) ? (occ.free(n.s, t, d) ? { s: n.s, f: n.f } : null)       // posisi (senar, fret) eksplisit: dipakai apa adanya
          : M.bestPos(n.m, hand, function (s) { return !occ.free(s, t, d); });
        if (p && addNote(notes, occ, p.s, p.f, t, d, n.x)) hand = p.f > 0 ? p.f : hand;
      });
      sec.bars.forEach(function (ch, i) { meta.chords.push({ t: t0 + i * bpb, name: ch.name }); accompany(notes, occ, ch, t0 + i * bpb, bpb, sec.pattern || 'arp'); });
      t0 += len;
    });
    if (spec.mood) meta.mood = spec.mood;
    return { v: 1, title: spec.title || '', tempo: spec.tempo || 90, key: spec.key || '', timeSig: ts, notes: notes, meta: meta };
  }

  /* ---------- [LABEL PEMBANGUN / TEKS BASS & DRUM] 8 kolom (per 8th) per birama, 2 birama per baris ---------- */
  function cell3(s) { s = String(s); return s.length === 1 ? '-' + s + '-' : s.length === 2 ? s + '-' : s; }
  function bassTab(chords, style) {
    var names = ['G', 'D', 'A', 'E'], off = { G: 43, D: 38, A: 33, E: 28 }, lines = [], pump = style === 'ceria';
    for (var i = 0; i < chords.length; i += 2) {
      var pair = chords.slice(i, i + 2), rows = { G: '', D: '', A: '', E: '' }, head = '  ';
      pair.forEach(function (c) {
        var f = (c.root - 4 + 12) % 12, root = { s: 'E', f: f }, fifth = f + 7 <= 12 ? { s: 'E', f: f + 7 } : { s: 'A', f: f + 2 };
        var cols = pump ? { 0: root, 2: root, 3: root, 4: fifth, 6: root, 7: root } : { 0: root, 2: root, 4: fifth, 6: root };
        names.forEach(function (n) { for (var k = 0; k < 8; k++) { var h = cols[k]; rows[n] += (h && h.s === n) ? cell3(h.f) : '---'; } rows[n] += '|'; });
        head += c.name + new Array(Math.max(1, 25 - c.name.length)).join(' ');
      });
      lines.push(head.replace(/\s+$/, ''));
      names.forEach(function (n) { lines.push(n + '|' + rows[n]); });
      lines.push('');
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }
  function drumTab(style, bars) {
    var B = style === 'ceria' ? { HH: 'xxxxxxxx', SD: '--o---o-', BD: 'o---o-o-' } : { HH: 'x-x-x-x-', SD: '----o---', BD: 'o-----o-' };
    if (style !== 'ceria') B = { HH: 'x-x-x-x-', SD: '--o---o-', BD: 'o---o-o-' };            // balada: backbeat + BD sedikit mendorong
    bars = bars || 2; var out = [];
    ['HH', 'SD', 'BD'].forEach(function (k) { var row = k + '|'; for (var b = 0; b < bars; b++) row += B[k] + '|'; out.push(row); });
    return out.join('\n');
  }

  G.songgen = { build: build, bassTab: bassTab, drumTab: drumTab, _Occ: Occ };
})(typeof window !== 'undefined' ? window : globalThis);
