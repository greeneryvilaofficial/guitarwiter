/* ============================================================================================
 * [LABEL MUSE WONDER / OFFLINE] guitarwriter.com/ai/generate-full.js  (v1.5.0)
 * "Wonder" versi lokal, TANPA API dan TANPA biaya: humming 30 detik -> melodi (dibaca di perangkat) -> kunci, tempo, akor ->
 * lagu penuh ~3 menit (Intro, Verse, Chorus, Bridge, Outro) lengkap tab gitar + lirik berakor. Tidak ada jaringan, tidak ada kuota.
 *
 * Alur: startHum() -> getHum() -> prepare(hum) [melodi {t,d,m} dalam detik] -> arrange(notes) [tab ~3 menit] -> GWAI.tab.set()
 * Audio berasal dari mic NATIVE (NativeMicPitchDetector -> HumRecorder) lewat AndroidKeyboard.*, bukan getUserMedia.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || !G.editor || !G.songgen || G.wonder) return;
  var M = G.music, S = G.songgen;

  var HUM_SECONDS = 30, MAX_NOTES = 200, MIN_NOTES = 3;
  var timer = null;

  function native() { try { return root.AndroidKeyboard || null; } catch (e) { return null; } }

  /* ---------- [LABEL WONDER / REKAM] 30 dtk terakhir dari mic native ---------- */
  function startHum(onTick, onReady) {
    var a = native();
    if (!a || !a.startHumCapture) return { ok: false, error: 'no-native-mic' };
    if (!a.startHumCapture()) return { ok: false, error: 'mic-not-running' };
    var left = HUM_SECONDS; G.emit('gw:hum-start', { seconds: left });
    cancelHum(true);
    timer = setInterval(function () {
      left--; if (onTick) { try { onTick(left); } catch (e) {} }
      if (left <= 0) { cancelHum(true); G.emit('gw:hum-ready', {}); if (onReady) { try { onReady(); } catch (e) {} } }
    }, 1000);
    return { ok: true };
  }
  function cancelHum(keepRecording) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!keepRecording) { var a = native(); try { a && a.stopHumCapture && a.stopHumCapture(); } catch (e) {} }
  }
  function getHum() {
    var a = native(), b64 = '';
    try { if (a && a.getLast30SecAudio) b64 = a.getLast30SecAudio() || ''; } catch (e) {}
    if (!b64) return { ok: false, error: 'no-audio' };
    var sec = 0; try { sec = a.humSeconds ? a.humSeconds() : 0; } catch (e) {}
    try { a.stopHumCapture && a.stopHumCapture(); } catch (e) {}
    return { ok: true, data: { audio: b64, seconds: sec } };
  }

  /* ---------- [LABEL WONDER / MELODI LOKAL] WAV -> daftar nada (tanpa jaringan) ---------- */
  function parseWav(b64) {
    var bin; try { bin = root.atob(b64); } catch (e) { return null; }
    if (bin.length < 48 || bin.substr(0, 4) !== 'RIFF') return null;
    var rate = (bin.charCodeAt(24) | (bin.charCodeAt(25) << 8) | (bin.charCodeAt(26) << 16)), bits = bin.charCodeAt(34) | (bin.charCodeAt(35) << 8);
    if (bits !== 16 || !rate) return null;
    var n = (bin.length - 44) >> 1, s = new Int16Array(n);
    for (var i = 0; i < n; i++) { var v = bin.charCodeAt(44 + 2 * i) | (bin.charCodeAt(45 + 2 * i) << 8); s[i] = v > 32767 ? v - 65536 : v; }
    return { rate: rate, samples: s };
  }
  // Pitch per frame: NSDF (McLeod): puncak pertama >= 0.9 x puncak tertinggi -> anti salah-oktaf; interpolasi parabola.
  function framePitch(x, start, N, rate, minLag, maxLag) {
    var W = N - maxLag, best = -1, peaks = [], prev = 0, prev2 = 0, lag, j;
    var nsdf = new Float32Array(maxLag + 2);
    for (lag = minLag - 1; lag <= maxLag; lag++) {
      var acf = 0, m = 0;
      for (j = 0; j < W; j++) { var a = x[start + j], b = x[start + j + lag]; acf += a * b; m += a * a + b * b; }
      nsdf[lag] = m > 0 ? 2 * acf / m : 0;
    }
    for (lag = minLag; lag < maxLag; lag++) {
      if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > 0.3) { peaks.push(lag); if (nsdf[lag] > best) best = nsdf[lag]; }
    }
    if (best < 0.6) return null;                                     // tidak bernada (desis / hening / suara campur)
    for (var p = 0; p < peaks.length; p++) {
      if (nsdf[peaks[p]] >= 0.9 * best) {
        var l = peaks[p], a1 = nsdf[l - 1], b1 = nsdf[l], c1 = nsdf[l + 1], den = a1 - 2 * b1 + c1;
        var lf = den !== 0 ? l + 0.5 * (a1 - c1) / den : l;
        return rate / lf;
      }
    }
    return null;
  }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }

  /** Int16Array -> Promise<[{t,d,m}]>. Dikerjakan per potongan (setTimeout) agar layar tidak membeku. */
  function melodyFromSamples(s, rate) {
    return new Promise(function (resolve) {
      var N = 1024, hop = 512, minLag = Math.floor(rate / 800), maxLag = Math.ceil(rate / 80);
      var nFrames = Math.max(0, Math.floor((s.length - N) / hop) + 1), i, rms = new Float32Array(nFrames), maxRms = 0;
      for (i = 0; i < nFrames; i++) { var e = 0, st = i * hop; for (var k = 0; k < N; k += 4) e += s[st + k] * s[st + k]; rms[i] = Math.sqrt(e / (N / 4)); if (rms[i] > maxRms) maxRms = rms[i]; }
      var gate = Math.max(150, 0.2 * maxRms), midi = new Array(nFrames), idx = 0;
      (function chunk() {
        var stop = Math.min(nFrames, idx + 40);
        for (; idx < stop; idx++) {
          midi[idx] = null;
          if (rms[idx] < gate) continue;
          var f0 = framePitch(s, idx * hop, N, rate, minLag, maxLag);
          if (f0) { var m = 69 + 12 * Math.log2(f0 / 440); if (m >= 36 && m <= 96) midi[idx] = m; }
        }
        if (idx < nFrames) { setTimeout(chunk, 0); return; }
        // median 5 bingkai, bulatkan ke semitone, gabungkan bingkai berurutan yang sama (celah 1 bingkai boleh)
        var sm = new Array(nFrames), q;
        for (q = 0; q < nFrames; q++) {
          if (midi[q] == null) { sm[q] = null; continue; }
          var w = []; for (var d = -2; d <= 2; d++) { var v = midi[q + d]; if (v != null) w.push(v); }
          sm[q] = Math.round(median(w));
        }
        var notes = [], cur = null, gap = 0;
        function flush() { if (cur && cur.n >= 4) notes.push({ t: +(cur.a * hop / rate).toFixed(2), d: +(cur.n * hop / rate).toFixed(2), m: cur.m }); cur = null; }
        for (q = 0; q < nFrames; q++) {
          var mm = sm[q];
          if (mm == null) { if (cur && ++gap > 1) flush(); continue; }
          if (cur && mm === cur.m) { cur.n += gap + 1; gap = 0; }
          else { flush(); cur = { a: q, n: 1, m: mm }; gap = 0; }
        }
        flush();
        resolve(notes.slice(0, MAX_NOTES));
      })();
    });
  }


  /* ---------- [LABEL WONDER / SIAPKAN] rekaman -> melodi (belum membuat lagu) ---------- */
  /** hum = {audio:<base64 WAV>}. -> Promise<{ok, data:{notes:[{t,d,m}] detik}}|{ok:false,error:'no-audio'|'bad-wav'|'no-melody'}> */
  function prepare(hum) {
    if (!hum || !hum.audio) return Promise.resolve({ ok: false, error: 'no-audio' });
    var w = parseWav(hum.audio); if (!w) return Promise.resolve({ ok: false, error: 'bad-wav' });
    return melodyFromSamples(w.samples, w.rate).then(function (notes) {
      return notes.length < MIN_NOTES ? { ok: false, error: 'no-melody' } : { ok: true, data: { notes: notes } };
    });
  }

  /* ---------- [LABEL WONDER / ANALISIS] tempo, kuantisasi, kunci ---------- */
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }
  function estimateTempo(notes) {                                  // selang antar-onset median ~ satu ketukan/8th -> dilipat ke 70..140 bpm
    var ioi = []; for (var i = 1; i < notes.length; i++) { var d = notes[i].t - notes[i - 1].t; if (d > 0.08) ioi.push(d); }
    if (!ioi.length) return 96;
    var T = 60 / median(ioi); while (T < 70) T *= 2; while (T > 140) T /= 2;
    return Math.round(T);
  }
  function quantize(notes, tempo) {                                // detik -> ketukan (grid 8th), tanpa onset ganda
    var o0 = notes[0].t, out = [], lastT = -1;
    notes.forEach(function (n) {
      var t = Math.round((n.t - o0) * tempo / 60 / 0.5) * 0.5; if (t <= lastT) return;
      out.push({ t: t, d: Math.min(4, Math.max(0.5, Math.round(n.d * tempo / 60 / 0.5) * 0.5)), m: n.m }); lastT = t;
    });
    out.forEach(function (n, i) { var nx = out[i + 1]; if (nx && n.t + n.d > nx.t) n.d = nx.t - n.t; });
    return out;
  }
  function fitOctave(notes) {                                      // geser oktaf agar median di G3..C5 dan semua di E2..B5
    var m = median(notes.map(function (n) { return n.m; })), shift = 0;
    while (m + shift > 72) shift -= 12; while (m + shift < 55) shift += 12;
    notes.forEach(function (n) { n.m += shift; while (n.m > 83) n.m -= 12; while (n.m < 40) n.m += 12; });
    return notes;
  }
  function degChord(key, deg) { var l = M.diatonic(key); for (var i = 0; i < l.length; i++) if (l[i].deg === deg) return l[i]; return l[0]; }

  /* ---------- [LABEL WONDER / ARANSEMEN] melodi (ketukan) -> lagu penuh ---------- */
  /** notesSec: [{t,d,m}] detik. opts: {seed, seconds (target, bawaan 175)}. -> {ok, data:{tab, analysis, lirik}} */
  function arrange(notesSec, opts) {
    opts = opts || {};
    if (!notesSec || notesSec.length < MIN_NOTES) return { ok: false, error: 'no-melody' };
    var base = notesSec.slice(0, MAX_NOTES).map(function (n) { return { t: n.t, d: n.d, m: n.m }; }), tempo = estimateTempo(base);
    var mel = fitOctave(quantize(base, tempo)), bpb = 4, w = new Array(12).fill(0.05);
    mel.forEach(function (n) { w[n.m % 12] += n.d; });
    var key = M.detectKey(w), endB = 0; mel.forEach(function (n) { if (n.t + n.d > endB) endB = n.t + n.d; });
    var Lv = Math.max(4, Math.min(16, Math.ceil(Math.ceil(endB / bpb - 1e-6) / 2) * 2));
    var verseNotes = mel.filter(function (n) { return n.t < Lv * bpb; });
    if (Lv < 8) {                                                  // humming pendek: melodi diulang sampai bait 8 birama (bentuk lagu yang wajar)
      var base0 = verseNotes.slice(), off0 = Lv * bpb; while (off0 < 8 * bpb) { base0.forEach(function (n) { if (off0 + n.t < 8 * bpb) verseNotes.push({ t: off0 + n.t, d: n.d, m: n.m }); }); off0 += Lv * bpb; }
      Lv = 8;
    }
    var verseChords = M.harmonize(verseNotes, Lv, bpb, key);
    var minor = key.mode === 'minor';
    var prog = (minor ? ['0min', '8maj', '3maj', '10maj'] : ['0maj', '7maj', '9min', '5maj']).map(function (d) { return degChord(key, d); });
    var bridgeP = (minor ? ['5min', '8maj', '0min', '7maj'] : ['9min', '5maj', '0maj', '7maj']).map(function (d) { return degChord(key, d); });
    var outroP = (minor ? ['0min', '5min', '0min', '0min'] : ['0maj', '5maj', '0maj', '0maj']).map(function (d) { return degChord(key, d); });
    var chorusChords = prog.concat(prog);
    var shift = 0; [5, 7, 12, 0].some(function (s) { var ok = verseNotes.every(function (n) { return n.m + s <= 83; }); if (ok) shift = s; return ok; });
    var chorusLead = [], bars8 = 8 * bpb, k = 0;
    while (chorusLead.length < 400) {                              // tiling melodi sampai 8 birama
      var off = k * Lv * bpb; if (off >= bars8) break;
      verseNotes.forEach(function (n) { if (off + n.t < bars8) chorusLead.push({ t: off + n.t, d: n.d, m: n.m + shift }); }); k++;
    }
    chorusLead.forEach(function (n) {                              // nada kuat -> nada akor terdekat (selaras dengan reff)
      if (n.t % 1 !== 0) return; var c = chorusChords[Math.min(7, Math.floor(n.t / bpb))], pcs = M.chordPcs(c), best = null, bd = 99;
      for (var d = -2; d <= 2; d++) if (pcs.indexOf((n.m + d) % 12) >= 0 && Math.abs(d) < bd) { bd = Math.abs(d); best = d; }
      if (best !== null) n.m += best;
    });
    var verse2 = verseNotes.map(function (n) { var o = { t: n.t, d: n.d, m: n.m }; if (n.d >= 2) o.x = '~'; return o; });
    function chorusSec(name) { return { name: name, bars: chorusChords, pattern: 'strum', lead: chorusLead }; }
    var secs = [{ name: 'Intro', bars: prog, pattern: 'arp' }, { name: 'Verse 1', bars: verseChords, pattern: 'arp', lead: verseNotes }, chorusSec('Chorus'),
                { name: 'Verse 2', bars: verseChords, pattern: 'arp', lead: verse2 }, chorusSec('Chorus'),
                { name: 'Bridge', bars: bridgeP, pattern: 'sustain' }, chorusSec('Final Chorus'), { name: 'Outro', bars: outroP, pattern: 'arp' }];
    function seconds() { var bars = 0; secs.forEach(function (s) { bars += s.bars.length; }); return bars * bpb * 60 / tempo; }
    var verses = 2, target = opts.seconds || 175;
    while (seconds() < target && verses < 6) { verses++; secs.splice(secs.length - 3, 0, { name: 'Verse ' + verses, bars: verseChords, pattern: 'arp', lead: verseNotes }, chorusSec('Chorus')); }
    var mood = minor ? 'galau' : 'ceria', title = 'Lagu Humming (' + key.name + ', ' + tempo + ' bpm)';
    var tab = S.build({ title: title, key: key.name, tempo: tempo, timeSig: [4, 4], mood: mood, sections: secs });
    var r = G.tab.set(tab, 'wonder'); if (!r.ok) return r;
    // lirik berakor untuk lagu ini (pakai penulis lirik lokal)
    var seed = opts.seed != null ? opts.seed : G.lyrics.hash(key.name + tempo + mel.length), L = G.lyrics.generate(mood, seed, verses), vi = 0, lirik = [];
    secs.forEach(function (s) {
      var names = s.bars.map(function (c) { return c.name; }), lines = [];
      if (/^Verse/.test(s.name)) lines = L.verses[vi++ % L.verses.length]; else if (/Chorus/.test(s.name)) lines = L.chorus; else if (s.name === 'Bridge') lines = L.bridge; else if (s.name === 'Outro') lines = L.outro;
      lirik.push(G.editor.chart(s.name, names, lines) + (lines.length ? '' : '\n(instrumental)'));
    });
    return { ok: true, data: { tab: r.data, lirik: lirik.join('\n\n'), title: L.title,
      analysis: { key: key.name, mode: key.mode, tempo: tempo, melodyNotes: mel.length, verseBars: Lv, seconds: Math.round(G.tab.seconds(r.data)), verseChords: verseChords.map(function (c) { return c.name; }), sections: secs.map(function (s) { return s.name; }) } } };
  }
  /** Rekaman -> lagu langsung. */
  function generate(hum, opts) {
    return prepare(hum).then(function (p) { return p.ok ? arrange(p.data.notes, opts) : p; });
  }

  G.wonder = { startHum: startHum, cancelHum: function () { cancelHum(false); }, getHum: getHum, prepare: prepare, arrange: arrange, generate: generate,
               _pure: { melodyFromSamples: melodyFromSamples, parseWav: parseWav, estimateTempo: estimateTempo, quantize: quantize } };
})(typeof window !== 'undefined' ? window : globalThis);
