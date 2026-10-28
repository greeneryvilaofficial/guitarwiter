/* ============================================================================================
 * [LABEL MUSIK / TEORI] guitarwriter.com/ai/music.js  (v1.5.0, OFFLINE)
 * Chord (parse + bentuk jari), posisi nada di gitar, tangga nada, deteksi kunci, harmonisasi melodi. Fungsi murni, tanpa jaringan.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || G.music) return;
  var OPEN = G.OPEN, NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function pcOf(n) {
    var m = /^([A-Ga-g])([#b]?)$/.exec(String(n)); if (!m) return -1;
    var v = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return (v + 12) % 12;
  }
  function noteMidi(name) {                                     // 'C4' = 60, 'F#3' = 54
    var m = /^([A-Ga-g][#b]?)(-?\d)$/.exec(String(name)); if (!m) return -1;
    var pc = pcOf(m[1]); return pc < 0 ? -1 : (parseInt(m[2], 10) + 1) * 12 + pc;
  }

  /* ---------- [LABEL MUSIK / CHORD] ---------- */
  var QUAL = {   // sufiks -> [kunci kualitas, interval]
    '': ['maj', [0, 4, 7]], 'maj': ['maj', [0, 4, 7]], 'm': ['min', [0, 3, 7]], 'min': ['min', [0, 3, 7]], '-': ['min', [0, 3, 7]],
    'dim': ['dim', [0, 3, 6]], 'aug': ['aug', [0, 4, 8]], '+': ['aug', [0, 4, 8]], 'sus2': ['sus2', [0, 2, 7]], 'sus4': ['sus4', [0, 5, 7]], 'sus': ['sus4', [0, 5, 7]],
    '5': ['5', [0, 7]], '6': ['6', [0, 4, 7, 9]], 'm6': ['m6', [0, 3, 7, 9]], '7': ['7', [0, 4, 7, 10]], 'maj7': ['maj7', [0, 4, 7, 11]], 'M7': ['maj7', [0, 4, 7, 11]],
    'm7': ['m7', [0, 3, 7, 10]], 'min7': ['m7', [0, 3, 7, 10]], 'm7b5': ['m7b5', [0, 3, 6, 10]], 'dim7': ['dim7', [0, 3, 6, 9]],
    '9': ['9', [0, 4, 7, 10, 2]], 'm9': ['m9', [0, 3, 7, 10, 2]], 'maj9': ['maj9', [0, 4, 7, 11, 2]], 'add9': ['add9', [0, 4, 7, 2]]
  };
  function parseChord(str) {
    var m = /^([A-Ga-g][#b]?)([A-Za-z0-9+\-]*)(?:\/([A-Ga-g][#b]?))?$/.exec(String(str).trim()); if (!m) return null;
    var root = pcOf(m[1]); if (root < 0) return null;
    var q = QUAL[m[2]]; if (!q) return null;
    var bass = m[3] ? pcOf(m[3]) : -1; if (m[3] && bass < 0) return null;
    return { name: String(str).trim(), root: root, q: q[0], ivs: q[1], bass: bass };
  }
  function chordName(rootPc, q) { return NAMES[rootPc] + ({ maj: '', min: 'm', dim: 'dim', '7': '7', m7: 'm7', maj7: 'maj7' }[q] || ''); }
  function chordPcs(c) { return c.ivs.map(function (i) { return (c.root + i) % 12; }); }

  // Bentuk jari terbuka: frets senar 6..1 (null = senar tidak dimainkan)
  var OPENSH = {
    E: [0,2,2,1,0,0], Em: [0,2,2,0,0,0], E7: [0,2,0,1,0,0], Em7: [0,2,0,0,0,0],
    A: [null,0,2,2,2,0], Am: [null,0,2,2,1,0], A7: [null,0,2,0,2,0], Am7: [null,0,2,0,1,0], Amaj7: [null,0,2,1,2,0], Asus2: [null,0,2,2,0,0], Asus4: [null,0,2,2,3,0],
    D: [null,null,0,2,3,2], Dm: [null,null,0,2,3,1], D7: [null,null,0,2,1,2], Dm7: [null,null,0,2,1,1], Dmaj7: [null,null,0,2,2,2], Dsus2: [null,null,0,2,3,0], Dsus4: [null,null,0,2,3,3],
    G: [3,2,0,0,0,3], G7: [3,2,0,0,0,1], Gmaj7: [3,2,0,0,0,2], C: [null,3,2,0,1,0], C7: [null,3,2,3,1,0], Cmaj7: [null,3,2,0,0,0], Cadd9: [null,3,2,0,3,0],
    B7: [null,2,1,2,0,2], Fmaj7: [null,null,3,2,1,0]
  };
  var ESH = { maj: [0,2,2,1,0,0], min: [0,2,2,0,0,0], '7': [0,2,0,1,0,0], m7: [0,2,0,0,0,0], maj7: [0,2,1,1,0,0], sus4: [0,2,2,2,0,0], '5': [0,2,2,null,null,null] };
  var ASH = { maj: [null,0,2,2,2,0], min: [null,0,2,2,1,0], '7': [null,0,2,0,2,0], m7: [null,0,2,0,1,0], maj7: [null,0,2,1,2,0], sus2: [null,0,2,2,0,0], sus4: [null,0,2,2,3,0], '5': [null,0,2,2,null,null] };
  var APPROX = { dim: 'min', aug: 'maj', '6': 'maj', m6: 'min', '9': '7', m9: 'm7', maj9: 'maj7', add9: 'maj', m7b5: 'm7', dim7: 'm7', sus2: 'sus2' };   // bentuk jari aproksimasi

  /** -> [{s, f}] (senar 6..1, nada yang dimainkan). Bentuk terbuka bila ada, kalau tidak bentuk barre yang digeser. */
  function voicing(c) {
    var frets = OPENSH[c.name.split('/')[0]];
    if (!frets) {
      var q = APPROX[c.q] || c.q, e = ESH[q] || ESH[q === 'sus2' ? 'maj' : 'maj'], a = ASH[q] || ASH.maj;
      var fE = (c.root - 4 + 12) % 12, fA = (c.root - 9 + 12) % 12, useA = ASH[q] && (!ESH[q] || fA < fE);
      var sh = useA ? a : e, off = useA ? fA : fE;
      frets = sh.map(function (f) { return f === null ? null : f + off; });
    }
    var out = []; for (var i = 0; i < 6; i++) if (frets[i] !== null && frets[i] <= 15) out.push({ s: 6 - i, f: frets[i] });
    if (c.bass >= 0 && c.bass !== c.root) {                      // chord slash: ganti nada bass
      for (var s = 6; s >= 4; s--) { var f = (c.bass - OPEN[s] % 12 + 12) % 12; out = out.filter(function (n) { return n.s < s; }); out.push({ s: s, f: f }); break; }
      out.sort(function (a2, b2) { return b2.s - a2.s; });
    }
    return out;
  }
  function voicingMidi(c) { return voicing(c).map(function (n) { return OPEN[n.s] + n.f; }); }

  /* ---------- [LABEL MUSIK / POSISI NADA] MIDI -> (senar, fret) dekat posisi tangan ---------- */
  function positions(midi) {
    var out = []; if (midi < 40 || midi > 83) return out;
    for (var s = 6; s >= 1; s--) { var f = midi - OPEN[s]; if (f >= 0 && f <= 19) out.push({ s: s, f: f }); }
    return out;
  }
  /** taken: fungsi (s) -> true bila senar tidak boleh dipakai. hand: fret perkiraan posisi tangan. */
  function bestPos(midi, hand, taken) {
    var best = null, bc = 1e9; hand = hand == null ? 5 : hand;
    positions(midi).forEach(function (p) {
      if (taken && taken(p.s)) return;
      var cost = Math.abs(p.f - hand) + (p.f > 12 ? 3 : 0) + (p.f === 0 ? -0.5 : 0);
      if (cost < bc) { bc = cost; best = p; }
    });
    return best;
  }

  /* ---------- [LABEL MUSIK / TANGGA NADA] ---------- */
  var SCALES = { major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10], pentMin: [0,3,5,7,10], blues: [0,3,5,6,7,10] };
  function snapPc(pc, rootPc, scale) {                           // semiton terdekat dalam tangga nada (seri -> turun)
    var rel = (pc - rootPc + 12) % 12, best = rel, bd = 99;
    SCALES[scale].forEach(function (d) { var dist = Math.min((rel - d + 12) % 12, (d - rel + 12) % 12); if (dist < bd || (dist === bd && ((rel - d + 12) % 12) < ((d - rel + 12) % 12))) { bd = dist; best = d; } });
    return best;
  }
  function snapMidi(m, rootPc, scale) {
    var rel = (m % 12 - rootPc + 12) % 12, target = snapPc(m % 12, rootPc, scale), diff = target - rel;
    if (diff > 6) diff -= 12; if (diff < -6) diff += 12;
    return m + diff;
  }

  /* ---------- [LABEL MUSIK / DETEKSI KUNCI] Krumhansl-Kessler ---------- */
  var KMAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], KMIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  function corr(a, b) {
    var n = a.length, ma = 0, mb = 0, i; for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    var num = 0, da = 0, db = 0; for (i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }
  /** weights: Array(12) bobot per pitch-class -> {root, mode:'major'|'minor', score, name:'Em'|'G'} */
  function detectKey(weights) {
    var best = { root: 0, mode: 'major', score: -2 };
    for (var r = 0; r < 12; r++) {
      var rot = []; for (var i = 0; i < 12; i++) rot.push(weights[(r + i) % 12]);
      var cM = corr(rot, KMAJ), cm = corr(rot, KMIN);
      if (cM > best.score) best = { root: r, mode: 'major', score: cM };
      if (cm > best.score) best = { root: r, mode: 'minor', score: cm };
    }
    best.name = NAMES[best.root] + (best.mode === 'minor' ? 'm' : '');
    return best;
  }
  function keyFromName(name) {                                    // 'Em' / 'F#' / 'Bb' -> {root, mode}
    var m = /^([A-Ga-g][#b]?)(m|min)?$/.exec(String(name || '')); if (!m) return null;
    var r = pcOf(m[1]); return r < 0 ? null : { root: r, mode: m[2] ? 'minor' : 'major', name: NAMES[r] + (m[2] ? 'm' : '') };
  }

  /* ---------- [LABEL MUSIK / HARMONISASI] akor diatonik terbaik per birama (Viterbi sederhana) ---------- */
  function diatonic(key) {
    var degs = key.mode === 'minor'
      ? [[0,'min'],[2,'dim'],[3,'maj'],[5,'min'],[7,'min'],[7,'maj'],[8,'maj'],[10,'maj']]
      : [[0,'maj'],[2,'min'],[4,'min'],[5,'maj'],[7,'maj'],[9,'min'],[11,'dim']];
    return degs.map(function (d) {
      var root = (key.root + d[0]) % 12, name = chordName(root, d[1]), c = parseChord(name);
      return { name: name, root: root, q: d[1], ivs: c.ivs, bass: -1, deg: d[0] + d[1] };
    });
  }
  var TRANS = {   // bonus perpindahan (derajat+kualitas): fungsi harmoni umum
    '0maj>5maj': 1.5, '0maj>7maj': 1.2, '0maj>9min': 1.3, '0maj>2min': 0.8, '5maj>7maj': 1.5, '5maj>0maj': 1.2, '5maj>2min': 0.6, '7maj>0maj': 2, '7maj>9min': 1.2,
    '9min>5maj': 1.6, '9min>2min': 1, '9min>7maj': 0.8, '2min>7maj': 1.6, '4min>9min': 1, '4min>5maj': 0.8,
    '0min>5min': 1.4, '0min>8maj': 1.3, '0min>10maj': 1.3, '0min>7maj': 1.2, '5min>7maj': 1.4, '5min>0min': 1.2, '8maj>10maj': 1.3, '8maj>7maj': 1.3, '10maj>0min': 1.4, '10maj>3maj': 1, '3maj>8maj': 1, '7min>0min': 1.2, '7maj>0min': 2, '8maj>0min': 0.8
  };
  /** notes: [{t,d,m}] dalam KETUKAN; bars: jumlah birama; bpb: ketukan per birama. -> Array(bars) objek chord */
  function harmonize(notes, bars, bpb, key) {
    var cands = diatonic(key), score = [], i, j, k;
    for (i = 0; i < bars; i++) {
      var w = new Array(12).fill(0), first = null;
      notes.forEach(function (n) {
        var a = Math.max(n.t, i * bpb), b = Math.min(n.t + n.d, (i + 1) * bpb); if (b <= a) return;
        var wt = (b - a) * (Math.abs(n.t - i * bpb) < 1e-6 || Math.abs(n.t % 1) < 1e-6 ? 1.6 : 1); w[n.m % 12] += wt;
      });
      score.push(cands.map(function (c) {
        var pcs = chordPcs(c), s = 0;
        for (var p = 0; p < 12; p++) { if (!w[p]) continue; s += w[p] * (pcs.indexOf(p) >= 0 ? 1 : (SCALES[key.mode].indexOf((p - key.root + 12) % 12) >= 0 ? -0.25 : -0.7)); }
        return s;
      }));
    }
    var dp = [], bp = [];
    for (i = 0; i < bars; i++) {
      dp.push([]); bp.push([]);
      for (j = 0; j < cands.length; j++) {
        if (i === 0) { dp[i][j] = score[i][j] + (cands[j].root === key.root ? 0.8 : 0); bp[i][j] = -1; continue; }
        var bv = -1e9, bi = 0;
        for (k = 0; k < cands.length; k++) {
          var tb = (TRANS[cands[k].deg + '>' + cands[j].deg] || 0) - (k === j ? 0.35 : 0), v = dp[i - 1][k] + tb;
          if (v > bv) { bv = v; bi = k; }
        }
        dp[i][j] = bv + score[i][j] + (i === bars - 1 && cands[j].root === key.root ? 1 : 0); bp[i][j] = bi;
      }
    }
    var bj = 0; for (j = 1; j < cands.length; j++) if (dp[bars - 1][j] > dp[bars - 1][bj]) bj = j;
    var out = new Array(bars); for (i = bars - 1; i >= 0; i--) { out[i] = cands[bj]; bj = bp[i][bj]; }
    return out;
  }

  G.music = { NAMES: NAMES, pcOf: pcOf, noteMidi: noteMidi, parseChord: parseChord, chordName: chordName, chordPcs: chordPcs, voicing: voicing, voicingMidi: voicingMidi,
              positions: positions, bestPos: bestPos, SCALES: SCALES, snapPc: snapPc, snapMidi: snapMidi, detectKey: detectKey, keyFromName: keyFromName, diatonic: diatonic, harmonize: harmonize };
})(typeof window !== 'undefined' ? window : globalThis);
