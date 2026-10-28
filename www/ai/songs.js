/* ============================================================================================
 * [LABEL PERPUSTAKAAN TAB LAGU / OFFLINE] guitarwriter.com/ai/songs.js  (v1.5.0)
 * Tab lagu bawaan, tersedia tanpa internet. HANYA lagu domain publik / tradisional dan latihan gitar yang disusun untuk proyek ini
 * (tidak ada lagu berhak cipta). Melodi ditulis sebagai teks "C4:1 D4:0.5 R:1" (nama nada:ketukan, R = istirahat);
 * akor diharmonisasi otomatis (kecuali ditentukan), lalu dirangkai jadi tab oleh songgen.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || !G.songgen || G.songs) return;
  var M = G.music, S = G.songgen;

  var LAGU = [
    { id: 'twinkle', title: 'Twinkle Twinkle Little Star', by: 'Tradisional (domain publik)', key: 'C', tempo: 96, ts: [4, 4], pattern: 'arp',
      mel: 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2' },
    { id: 'ode', title: 'Ode to Joy (Beethoven)', by: 'Ludwig van Beethoven (domain publik)', key: 'C', tempo: 108, ts: [4, 4], pattern: 'arp',
      mel: 'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 ' +
           'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2 ' +
           'D4:1 D4:1 E4:1 C4:1 D4:1 E4:0.5 F4:0.5 E4:1 C4:1 D4:1 E4:0.5 F4:0.5 E4:1 D4:1 C4:1 D4:1 G3:2 ' +
           'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2' },
    { id: 'birthday', title: 'Selamat Ulang Tahun (Happy Birthday)', by: 'Tradisional (domain publik)', key: 'C', tempo: 100, ts: [3, 4], pattern: 'arp',
      mel: 'G4:0.75 G4:0.25 A4:1 G4:1 C5:1 B4:2 G4:0.75 G4:0.25 A4:1 G4:1 D5:1 C5:2 G4:0.75 G4:0.25 G5:1 E5:1 C5:1 B4:1 A4:1 F5:0.75 F5:0.25 E5:1 C5:1 D5:1 C5:2' },
    { id: 'jingle', title: 'Jingle Bells (reff)', by: 'James Lord Pierpont (domain publik)', key: 'C', tempo: 120, ts: [4, 4], pattern: 'strum',
      mel: 'E4:1 E4:1 E4:2 E4:1 E4:1 E4:2 E4:1 G4:1 C4:1.5 D4:0.5 E4:4 F4:1 F4:1 F4:1.5 F4:0.5 F4:1 E4:1 E4:1 E4:0.5 E4:0.5 E4:1 D4:1 D4:1 E4:1 D4:2 G4:2' },
    { id: 'frere', title: 'Frère Jacques', by: 'Tradisional Prancis (domain publik)', key: 'C', tempo: 100, ts: [4, 4], pattern: 'arp',
      mel: 'C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1 E4:1 F4:1 G4:2 E4:1 F4:1 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 C4:1 G3:1 C4:2 C4:1 G3:1 C4:2' },
    { id: 'mary', title: 'Mary Had a Little Lamb', by: 'Tradisional (domain publik)', key: 'C', tempo: 110, ts: [4, 4], pattern: 'arp',
      mel: 'E4:1 D4:1 C4:1 D4:1 E4:1 E4:1 E4:2 D4:1 D4:1 D4:2 E4:1 G4:1 G4:2 E4:1 D4:1 C4:1 D4:1 E4:1 E4:1 E4:1 E4:1 D4:1 D4:1 E4:1 D4:1 C4:4' }
  ];

  function parseMelody(str) {
    var notes = [], t = 0;
    String(str).trim().split(/\s+/).forEach(function (tok) {
      var p = tok.split(':'), d = parseFloat(p[1]); if (!(d > 0)) return;
      if (p[0] !== 'R') { var m = M.noteMidi(p[0]); if (m >= 40 && m <= 83) notes.push({ t: +t.toFixed(4), d: d, m: m }); }
      t += d;
    });
    return { notes: notes, length: t };
  }
  function buildMelodic(s) {
    var key = M.keyFromName(s.key), bpb = s.ts[0] * 4 / s.ts[1], mel = parseMelody(s.mel), bars = Math.ceil(mel.length / bpb - 1e-6);
    var chords = M.harmonize(mel.notes, bars, bpb, key);
    var tab = S.build({ title: s.title, key: s.key, tempo: s.tempo, timeSig: s.ts, mood: 'lagu', sections: [{ name: 'Melodi + akor', bars: chords, pattern: s.pattern, lead: mel.notes }] });
    return tab;
  }

  /* ---------- [LABEL PERPUSTAKAAN / LATIHAN] riff & progresi yang disusun untuk proyek ini ---------- */
  function boogie(roots) {                       // 12 bar blues E: boogie root-5-6-b7-6-5, 8 nada per birama
    var chords = roots.map(function (r) { return M.parseChord(r.name); }), lead = [], steps = [0, 7, 9, 10, 9, 7, 9, 10];
    roots.forEach(function (r, i) { steps.forEach(function (st, k) { lead.push({ t: i * 4 + k * 0.5, d: 0.5, m: r.midi + st }); }); });
    return S.build({ title: '12-Bar Blues di E (boogie)', key: 'E', tempo: 100, timeSig: [4, 4], mood: 'blues', sections: [{ name: 'Boogie 12 bar', bars: chords, pattern: 'none', lead: lead }] });
  }
  function boxAm() {                             // Am pentatonik box 1 (posisi fret 5): naik lalu turun, posisi senar/fret eksplisit
    var up = [[6,5],[6,8],[5,5],[5,7],[4,5],[4,7],[3,5],[3,7],[2,5],[2,8],[1,5],[1,8]], seq = up.concat(up.slice(0, -1).reverse()), lead = [];
    seq.forEach(function (p, i) { lead.push({ t: i * 0.5, d: 0.5, m: G.OPEN[p[0]] + p[1], s: p[0], f: p[1] }); });
    var bars = Math.ceil(seq.length * 0.5 / 4), chords = []; for (var i = 0; i < bars; i++) chords.push(M.parseChord('Am'));
    return S.build({ title: 'Am Pentatonik Box 1 (naik-turun)', key: 'Am', tempo: 80, timeSig: [4, 4], mood: 'latihan', sections: [{ name: 'Posisi fret 5', bars: chords, pattern: 'none', lead: lead }] });
  }
  function canon() {                             // progresi 8 akor bergaya Canon (D A Bm F#m G D G A), arpeggio
    var chords = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'].map(M.parseChord);
    return S.build({ title: 'Progresi Canon (D A Bm F#m G D G A)', key: 'D', tempo: 70, timeSig: [4, 4], mood: 'latihan', sections: [{ name: 'Progresi', bars: chords, pattern: 'arp' }, { name: 'Ulang (strum)', bars: chords, pattern: 'strum' }] });
  }
  var LATIHAN = [
    { id: 'blues12', title: '12-Bar Blues di E (boogie)', by: 'Latihan (disusun untuk proyek ini)', make: function () { var E = 40, A = 45, B = 47, r = function (n, m) { return { name: n, midi: m }; };
        return boogie([r('E7', E), r('E7', E), r('E7', E), r('E7', E), r('A7', A), r('A7', A), r('E7', E), r('E7', E), r('B7', B), r('A7', A), r('E7', E), r('B7', B)]); } },
    { id: 'boxAm', title: 'Am Pentatonik Box 1 (naik-turun)', by: 'Latihan (disusun untuk proyek ini)', make: boxAm },
    { id: 'canon', title: 'Progresi Canon (D A Bm F#m G D G A)', by: 'Latihan (progresi akor umum)', make: canon }
  ];

  function list() {
    return LAGU.map(function (s) { return { id: s.id, kind: 'lagu', title: s.title, by: s.by }; })
      .concat(LATIHAN.map(function (s) { return { id: s.id, kind: 'latihan', title: s.title, by: s.by }; }));
  }
  /** id -> {ok, data: tab (belum dipasang)}; pemasangan lewat GWAI.tab.set oleh pemanggil. */
  function get(id) {
    var i, tab = null;
    for (i = 0; i < LAGU.length; i++) if (LAGU[i].id === id) tab = buildMelodic(LAGU[i]);
    for (i = 0; i < LATIHAN.length; i++) if (LATIHAN[i].id === id) tab = LATIHAN[i].make();
    if (!tab) return { ok: false, error: 'unknown-song' };
    var v = G.tab.validate(tab); return v.ok ? { ok: true, data: v.data, dropped: v.dropped } : v;
  }
  G.songs = { list: list, get: get, _parseMelody: parseMelody, _LAGU: LAGU };
})(typeof window !== 'undefined' ? window : globalThis);
