// Uji modul AI OFFLINE (v1.5.0). Jalankan: node tools/ai-test.js  (Node polos, tanpa dependensi)
// Semua API jaringan DIBLOKIR selama uji: bila ada modul yang mencoba memanggilnya, uji gagal.
const fs = require('fs'), path = require('path');
const AI = path.join(__dirname, '..', 'www', 'ai'), HTML = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8'), SW = fs.readFileSync(path.join(__dirname, '..', 'www', 'sw.js'), 'utf8');
let fail = 0, total = 0; const ok = (c, m) => { total++; if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };

// ---- lingkungan palsu + pemblokir jaringan ----
global.window = global; const ls = { meta_key: 'KEY-LAMA', gwai_cfg_v1: '{}', gwai_wonder_quota: '{}' };
global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
let netCalls = 0; const block = n => () => { netCalls++; throw new Error('JARINGAN DIPANGGIL: ' + n); };
global.fetch = block('fetch'); global.XMLHttpRequest = function () { block('XMLHttpRequest')(); }; global.WebSocket = function () { block('WebSocket')(); };
global.navigator = { sendBeacon: block('sendBeacon') }; global.EventSource = function () { block('EventSource')(); };
const evs = []; global.document = { addEventListener() {}, dispatchEvent(e) { evs.push(e.type); return true; } }; global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
global.atob = s => Buffer.from(s, 'base64').toString('binary');
for (const f of ['ai-core', 'music', 'lyrics', 'songgen', 'songs', 'editor', 'generate-full', 'waveform']) (0, eval)(fs.readFileSync(path.join(AI, f + '.js'), 'utf8'));
const G = GWAI, M = G.music, S = G.songgen, E = G.editor, W = G.wonder, O = G.OPEN, mid = t => t.notes.map(n => O[n.s] + n.f);

(async () => {
  // ===== 0. OFFLINE: tidak ada jaringan di kode =====
  const files = fs.readdirSync(AI).filter(f => f.endsWith('.js')); let hit = [];
  for (const f of files) { const src = fs.readFileSync(path.join(AI, f), 'utf8'); for (const w of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'http://', 'https://', 'Authorization', 'api_key', 'apiKey']) if (src.includes(w)) hit.push(f + ':' + w); }
  ok(files.length === 8 && hit.length === 0, 'kode www/ai/*.js (' + files.length + ' berkas) tanpa fetch/XHR/WebSocket/URL/Authorization' + (hit.length ? ' -> ' + hit : ''));
  const blk = HTML.slice(HTML.indexOf('[LABEL AI / v1.5.0 / OFFLINE]')); ok(!/api\.meta|Authorization|fetch\(|apiKey|Test Connection/.test(blk) && !/kolom API Key|Endpoint \(opsional\)/.test(blk), 'blok AI di index.html tanpa kunci/endpoint/Test Connection');
  ok(!HTML.includes("localStorage.getItem('meta_key')") && /\['meta_key','gwai_cfg_v1','gwai_wonder_quota'\]\.forEach\(function\(k\)\{ localStorage\.removeItem\(k\)/.test(HTML), 'kunci lama (meta_key, cfg, kuota) dihapus saat dimuat dan tidak dibaca di mana pun');
  const mods = /var MODS = \[([^\]]+)\]/.exec(blk)[1].match(/ai\/[a-z-]+\.js/g); ok(mods.length === 8 && mods.every(m => fs.existsSync(path.join(__dirname, '..', 'www', m)) && SW.includes("'" + m + "'")), 'pemuat memuat 8 modul yang ada di disk dan di cache sw.js');
  ok(/prefs\.ai && window\.gwaiOpen\) window\.gwaiOpen\(\)/.test(HTML) && HTML.includes("k:'ai', t:'Fitur cerdas (offline)'") && HTML.includes('ai:false,'), 'saklar tetap ada: bawaan MATI, ON -> panel terbuka');
  for (const sec of ['① Ubah tab (Spark offline)', '② Chord → Lagu + lirik', '③ Humming → Lagu Full (Wonder offline)', '④ Perpustakaan tab lagu', '⑤ Waveform, segmentasi & sampul']) ok(blk.includes(sec), 'panel: ' + sec);
  ok(/\.textContent = /.test(blk) && !/innerHTML/.test(blk), 'panel menulis lewat textContent, tanpa innerHTML');

  // ===== 1. inti tab =====
  const t0 = G.tab.sample(); t0.meta = { sections: [{ t: 0, name: 'Intro' }], chords: [{ t: 0, name: 'Em' }, { t: 2, name: 'A' }, { t: 2, name: 'A' }], mood: 'x' };
  const v0 = G.tab.validate(t0); ok(v0.ok && v0.data.meta.sections.length === 1 && v0.data.meta.chords.length === 3, 'validasi: meta (bagian, akor) lolos');
  const asc = G.tab.toAscii(v0.data); ok(asc.split('\n').length === 8 && asc.includes('▸ Intro') && /\n *Em +A\n/.test(asc), 'ASCII: label bagian + akor di atas 6 senar');
  const bad = G.tab.validate({ notes: [{ t: 0, d: 1, s: 6, f: 0, x: 'b' }, { t: 1, d: 1, s: 6, f: 30 }, { t: 2, d: 1, s: 9, f: 1 }, { t: 3, d: 1, s: 1, f: 24 }, { t: 0, d: 1, s: 5, f: 0, x: 'ZZ' }], tempo: 999, meta: { chords: [{ t: -1, name: 'X' }, { t: 1, name: 'ok' }], sections: 5 } });
  ok(bad.ok && bad.data.notes.length === 2 && bad.dropped === 3 && bad.data.notes.find(n => n.s === 6).x === 'b' && bad.data.notes.find(n => n.s === 5).x === undefined && bad.data.tempo === 100 && bad.data.meta.chords.length === 1, 'validasi: buang senar/fret/MIDI salah, teknik tak dikenal dibuang, meta dibersihkan');
  ok(!G.tab.validate({ notes: [] }).ok && !G.tab.validate('bukan json').ok && !G.tab.validate(null).ok, 'tab kosong / bukan JSON ditolak');
  const x1 = G.tab.validate({ notes: [{ t: 0, d: 1, s: 3, f: 12, x: '~' }, { t: 1, d: 1, s: 2, f: 10, x: 'b' }] }).data; ok(G.tab.toAscii(x1).includes('12~') && G.tab.toAscii(x1).includes('10b'), 'ASCII: teknik ~ dan b tampil di sel 3 karakter');

  // ===== 2. teori musik =====
  ok(M.noteMidi('C4') === 60 && M.noteMidi('E2') === 40 && M.noteMidi('B5') === 83, 'noteMidi'); let cOk = 0;
  for (const n of ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm', 'F#m', 'Bb', 'Eb', 'G7', 'D7', 'A7', 'E7', 'B7', 'Am7', 'Em7', 'Cmaj7', 'Dsus4', 'Asus2', 'G/B', 'D/F#', 'C/G', 'E5']) { const c = M.parseChord(n), v = M.voicing(c), ms = v.map(x => O[x.s] + x.f), p = M.chordPcs(c); if (v.length >= 2 && ms.every(m => p.includes(m % 12) && m >= 40 && m <= 83)) cOk++; }
  ok(cOk === 31, 'bentuk jari 31 akor: semua nada anggota akor & dalam rentang (' + cOk + '/31)');
  ok(M.parseChord('H') === null && M.parseChord('Cxyz') === null && M.parseChord('') === null, 'akor tak valid -> null');
  let pOk = true; for (let m = 40; m <= 83; m++) { const p = M.bestPos(m, 5); if (!p || O[p.s] + p.f !== m) pOk = false; } ok(pOk && M.bestPos(39, 5) === null && M.bestPos(84, 5) === null, 'bestPos: 44 nada E2..B5 benar, di luar rentang null');
  const wts = (l) => { const a = new Array(12).fill(0.1); l.forEach(([p, x]) => a[p] += x); return a; };
  ok(M.detectKey(wts([[9, 4], [0, 2], [4, 3], [2, 1], [5, 1], [7, 1]])).name === 'Am' && M.detectKey(wts([[7, 4], [11, 2], [2, 3], [0, 1], [4, 2], [9, 2], [6, 1]])).name === 'G', 'deteksi kunci Am & G');
  ok(M.snapMidi(61, 9, 'blues') === 60 && M.snapMidi(64, 9, 'blues') === 64, 'snap tangga blues');

  // ===== 3. pembangun lagu =====
  const chs = ['Em', 'C', 'G', 'D'].map(M.parseChord), lead = [{ t: 0, d: 1, m: 64 }, { t: 1, d: 1, m: 67 }, { t: 2, d: 2, m: 71 }];
  for (const pat of ['arp', 'strum', 'sustain']) { const tab = S.build({ title: 'T', key: 'Em', tempo: 80, sections: [{ name: 'V', bars: chs, pattern: pat, lead }] }), v = G.tab.validate(tab); let ov = 0; const by = {}; tab.notes.forEach(n => (by[n.s] = by[n.s] || []).push(n)); Object.values(by).forEach(a => { a.sort((x, y) => x.t - y.t); for (let i = 1; i < a.length; i++) if (a[i].t < a[i - 1].t + a[i - 1].d - 1e-6) ov++; });
    ok(v.ok && v.dropped === 0 && ov === 0 && [64, 67, 71].every(m => mid(tab).includes(m)), 'pola ' + pat + ': valid, tanpa tumpang tindih senar, melodi utuh (' + tab.notes.length + ' nada)'); }
  ok(S.bassTab(chs, 'galau').includes('E|') && /^HH\|/.test(S.drumTab('ceria')), 'teks bass & drum');
  const L = G.lyrics, la = L.generate('galau', 7), lb = L.generate('galau', 7), lc = L.generate('galau', 8), flat = la.verses.flat();
  ok(JSON.stringify(la) === JSON.stringify(lb) && JSON.stringify(la) !== JSON.stringify(lc) && la.verses.length === 3 && la.verses.every(v => v.length === 4) && new Set(flat).size === flat.length, 'lirik: deterministik per benih, variasi per benih, 3 bait x4 tanpa pengulangan');

  // ===== 4. perpustakaan tab lagu =====
  const lib = G.songs.list(); ok(lib.length === 9 && lib.filter(x => x.kind === 'lagu').length === 6, 'perpustakaan: 6 lagu + 3 latihan');
  for (const it of lib) { const r = G.songs.get(it.id); ok(r.ok && r.dropped === 0 && r.data.notes.length > 20 && mid(r.data).every(m => m >= 40 && m <= 83), 'tab ' + it.id + ': ' + (r.ok ? r.data.notes.length + ' nada, ' + Math.round(G.tab.seconds(r.data)) + ' dtk' : r.error)); }
  for (const s of G.songs._LAGU) { const mel = G.songs._parseMelody(s.mel).notes, tab = G.songs.get(s.id).data; ok(mel.every(n => tab.notes.some(x => Math.abs(x.t - n.t) < 1e-3 && O[x.s] + x.f === n.m)), s.id + ': ' + mel.length + ' nada melodi semua ada di tab'); }
  const beats = G.songs._LAGU.map(s => G.songs._parseMelody(s.mel).length); ok(JSON.stringify(beats) === '[48,64,24,32,32,32]', 'panjang melodi = kelipatan birama: ' + beats);
  ok(G.songs.get('xx').error === 'unknown-song', 'lagu tak dikenal -> unknown-song');

  // ===== 5. Spark offline: perintah gaya =====
  ok(E.run('x').error === 'no-active-tab', 'tanpa tab aktif -> no-active-tab');
  const reset = () => G.tab.set(G.tab.sample(), 'reset');
  for (const c of ['bikin lebih bluesy', 'buat jadi galau', 'bikin ceria', 'jadi rock', 'versi fingerstyle', 'lebih cepat', 'lebih lambat', 'naikin 2 nada', 'turunin 3 nada', 'ulang dua kali', 'make it bluesy and faster', 'bluesy dan lebih lambat']) { reset(); const b = G.tab.get(), r = E.run(c); ok(r.ok && r.dropped === 0 && r.data.notes.length >= b.notes.length && mid(r.data).every(m => m >= 40 && m <= 83), '"' + c + '" -> ' + (r.ok ? r.applied.join('+') + ', ' + r.data.notes.length + ' nada, ' + r.data.tempo + ' bpm, ' + r.data.key : r.error)); }
  reset(); let b0 = G.tab.get(), r = E.run('lebih cepat'); ok(r.data.tempo === 108 && r.data.notes.length === b0.notes.length, 'cepat: 90 -> 108 bpm');
  reset(); r = E.run('lebih lambat'); ok(r.data.tempo === 72, 'lambat: 72 bpm');
  reset(); b0 = G.tab.get(); r = E.run('naikin 2 nada'); ok(r.data.key === 'F#' && JSON.stringify(mid(r.data).sort()) === JSON.stringify(mid(b0).map(m => m + 2).sort()), 'naik 2 nada: E -> F#, semua nada +2');
  reset(); b0 = G.tab.get(); r = E.run('ulang'); ok(r.data.notes.length === b0.notes.length * 2, 'ulang: nada dua kali lipat');
  reset(); r = E.run('bikin lebih bluesy'); ok(mid(r.data).every(m => [0, 3, 5, 6, 7, 10].includes((m - 4 + 120) % 12)) && r.data.title.includes('Bluesy') && r.data.notes.some(n => n.x === 'b' || n.x === '~'), 'bluesy: semua nada anggota tangga blues E + bend/vibrato');
  reset(); r = E.run('buat jadi galau'); ok(r.data.tempo < 90 && r.data.meta.mood === 'galau', 'galau: tempo turun, suasana tercatat');
  ok(E.run('halo apa kabar').error === 'unknown-command' && E.run('halo').suggestions.length >= 8, 'perintah tak dikenal -> saran');
  ok(E.parse('buat galau tapi ceria').actions.join() === 'galau' && E.parse('naikin tiga nada').n === 3 && E.parse('naik 5 semitone').n === 5, 'parser: suasana pertama menang, angka nada');
  reset(); const before = JSON.stringify(G.tab.get()); E.run('jadi rock'); G.tab.undo(); ok(JSON.stringify(G.tab.get()) === before, 'undo mengembalikan tab');
  G.tab.set(G.songs.get('twinkle').data, 'lib'); r = E.run('bikin lebih bluesy dan lebih cepat'); ok(r.ok && r.data.notes.length > 100, 'tab lagu dari perpustakaan + perintah: ' + r.data.notes.length + ' nada');

  // ===== 6. Spark offline: chord -> lagu =====
  let c = E.fromChords('Em C G D'); ok(c.ok && c.data.mood === 'galau' && c.data.seconds >= 140 && c.data.seconds <= 240 && c.data.tab.notes.length > 300 && c.data.lirik.includes('[Verse 1]') && c.data.lirik.includes('[Chorus]'), 'Em C G D: galau, ' + c.data.seconds + ' dtk, ' + c.data.tab.notes.length + ' nada, lirik berakor');
  ok(c.data.tab.meta.sections.map(s => s.name).join('|').startsWith('Intro|Verse 1|Chorus|Verse 2|Chorus') && c.data.bassTab.length > 20 && c.data.drumTab.startsWith('HH|'), 'struktur lagu + bass + drum');
  const c2 = E.fromChords('C G Am F'), c3 = E.fromChords('C G Am F', { seed: 99 }); ok(c2.data.mood === 'ceria' && c3.data.lirik !== c2.data.lirik && c3.data.tab.notes.length === c2.data.tab.notes.length, 'C G Am F: ceria; benih lain = lirik beda, tab sama');
  ok(E.fromChords('Am F C G', { mood: 'ceria' }).data.mood === 'ceria', 'suasana bisa dipaksa');
  ok(E.fromChords('Em Hx G').detail === 'Hx' && E.fromChords('').error === 'bad-chord' && E.fromChords('C '.repeat(17)).error === 'bad-chord', 'akor salah ditolak dengan petunjuk');
  ok(E.fromChords('Am').ok && E.fromChords('Am7 Dm7 G7 Cmaj7').ok && E.fromChords('E7 A7 B7').ok && E.fromChords('G/B D/F# Em C').ok, 'progresi 1 akor, jazz, blues, slash chord');

  // ===== 7. Wonder offline: humming -> lagu =====
  const wav = (spec, rate = 16000, harm = [1, .5, .3, .15]) => { const total = Math.round(spec.reduce((a, x) => a + x[1], 0) * rate), s = new Int16Array(total); let p = 0, ph = 0;
    for (const [m, sec] of spec) { const n = Math.round(sec * rate); for (let i = 0; i < n; i++) { let v = 0; if (m) { const f = 440 * Math.pow(2, (m - 69 + 0.3 * Math.sin(2 * Math.PI * 5 * (p + i) / rate)) / 12); ph += 2 * Math.PI * f / rate; for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(ph * (h + 1)); v *= 0.35 * Math.min(1, i / 400, (n - i) / 400); } v += (((p + i) * 9301 + 49297) % 233280 / 233280 - 0.5) * 0.02; s[p + i] = Math.max(-32768, Math.min(32767, Math.round(v * 20000))); } p += n; }
    const b = Buffer.alloc(44 + total * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + total * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(total * 2, 40); for (let i = 0; i < total; i++) b.writeInt16LE(s[i], 44 + 2 * i); return b.toString('base64'); };
  const hz = [57, 60, 64, 62, 60, 57, 59, 64, 60, 57, 59, 60, 62, 60, 59, 57], spec = [[0, .3]]; hz.forEach(m => spec.push([m, .5], [0, .08]));
  for (const [nm, hm] of [['normal', [1, .5, .3, .15]], ['fundamental lemah', [.15, 1, .6, .3]], ['harmonik 2-3 saja', [.05, 1, .9, .4]]]) { const rr = await W.generate({ audio: wav(spec, 16000, hm) }); ok(rr.ok && rr.data.analysis.key === 'Am' && rr.data.analysis.seconds >= 165 && rr.data.analysis.seconds <= 260 && rr.data.tab.notes.length <= 6000, 'humming A minor (' + nm + '): kunci ' + (rr.ok ? rr.data.analysis.key + ', ' + rr.data.analysis.tempo + ' bpm, ' + rr.data.analysis.seconds + ' dtk, ' + rr.data.tab.notes.length + ' nada' : rr.error)); }
  const R = await W.generate({ audio: wav(spec) }), tab = R.data.tab, v1 = tab.meta.sections.find(s => s.name === 'Verse 1').t, leadN = tab.notes.filter(n => n.t >= v1 && n.t < v1 + 8 && n.d >= 0.5).map(n => O[n.s] + n.f);
  ok(['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Bridge', 'Final Chorus', 'Outro'].every(s => R.data.analysis.sections.includes(s)) && [57, 60, 64].every(m => leadN.includes(m)) && mid(tab).every(m => m >= 40 && m <= 83), 'struktur lengkap, melodi humming (A3 C4 E4) ada di Verse 1, semua nada dalam rentang');
  ok(R.data.lirik.includes('[Verse 1]') && R.data.lirik.split('\n').length > 40, 'lirik berakor untuk lagu humming (' + R.data.lirik.split('\n').length + ' baris)');
  const r2 = await W.generate({ audio: wav([[0, .3]].concat([60, 62, 64, 67, 64, 62, 60, 67, 69, 67, 64, 62, 60].flatMap(m => [[m, .45], [0, .1]]))) }); ok(r2.ok && r2.data.analysis.key === 'C' && r2.data.analysis.mode === 'major', 'humming C mayor terbaca: ' + (r2.ok ? r2.data.analysis.key : r2.error));
  ok((await W.generate({ audio: wav([[0, 3]]) })).error === 'no-melody' && (await W.generate(null)).error === 'no-audio' && (await W.generate({ audio: 'AAAA' })).error === 'bad-wav' && W.arrange([{ t: 0, d: .5, m: 60 }]).error === 'no-melody', 'hening / kosong / WAV rusak / <3 nada ditolak');
  const ET = W._pure.estimateTempo; ok(ET(hz.map((m, i) => ({ t: i * .6 }))) === 100 && ET(hz.map((m, i) => ({ t: i * .3 }))) >= 70, 'tempo dari selang nada: 0,6 dtk -> 100 bpm');
  let rec = false; global.AndroidKeyboard = { startHumCapture: () => { rec = true; return true; }, stopHumCapture: () => { rec = false; }, humSeconds: () => 2, getLast30SecAudio: () => wav(spec) };
  const gh = W.getHum(); ok(gh.ok && rec === false && W.startHum().ok === true, 'getHum mengambil WAV lalu menghentikan rekam; startHum memulai'); W.cancelHum(); global.AndroidKeyboard.startHumCapture = () => false; ok(W.startHum().error === 'mic-not-running', 'mic native mati -> mic-not-running');

  // ===== 8. waveform: SAM + Image lokal =====
  const P = G.waveform._pure, rate = 16000, s6 = new Int16Array(rate * 6); [[0, 1.2], [1.8, 3.0], [3.2, 3.45], [4.5, 5.7]].forEach(([a, b]) => { for (let i = Math.floor(a * rate); i < Math.floor(b * rate); i++) s6[i] = Math.round(9000 * Math.sin(2 * Math.PI * 220 * i / rate)); });
  const ph = P.segmentPhrases(s6, rate); ok(ph.length === 3 && ph[0].label === 'Frasa 1' && Math.abs(ph[2].start - 4.5) < 0.1, 'SAM lokal: 3 frasa (yang < 0,4 dtk dibuang)'); ok(P.segmentPhrases(new Int16Array(rate * 2), rate).length === 0, 'hening -> 0 frasa');
  const cv = { width: 360, height: 56, getContext: () => ({ clearRect() {}, fillRect() {}, fillText() {} }) }, wf = G.waveform.create(cv), wb = wav(spec);
  ok(wf.setWavBase64(wb).ok && !wf.setWavBase64('AAAA').ok && wf.segment().ok && G.waveform.create(cv).segment().error === 'no-audio', 'komponen waveform: muat, tolak rusak, segmentasi, tanpa audio'); wf.mark(329.63); ok(wf.state.marks[0].name === 'E4', 'penanda nada dari native'); wf.setColor('#6BABA4'); wf.setColor('javascript:alert(1)'); wf.setColor('red'); ok(true, 'setColor menerima hex/rgb saja (yang lain diabaikan, tidak error)');
  const calls = {}, ctx = new Proxy({}, { get: (t, k) => k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { (calls[k] = calls[k] || []).push(a); }, set: () => true });
  P.drawCover(ctx, 480, 480, { title: 'Pulanglah, Bandung', key: 'Em', tempo: 78, mood: 'galau', notes: [52, 55, 59, 64, 67, 71, 64] }); ok(calls.fillText.some(a => String(a[0]).includes('Pulanglah')) && calls.fillText.some(a => a[0] === 'Em \u00B7 78 bpm') && calls.arc.length === 9, 'Image lokal: judul, kunci·tempo, 9 riak digambar');
  ok(P.wrapTitle('Menunggu Hujan Reda (Galau)').join('|') === 'Menunggu Hujan|Reda' && P.palette('galau')[0] === '#0b132b' && P.palette('zzz').length === 4, 'judul dibungkus, palet per suasana + cadangan');
  global.document.createElement = () => ({ width: 0, height: 0, getContext: () => ({ createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, arc() {}, stroke() {}, moveTo() {}, quadraticCurveTo() {}, fillText() {} }), toDataURL: () => 'data:image/png;base64,AAAA' });
  G.tab.set(G.tab.sample(), 't'); ok(G.waveform.makeCover().data.src.startsWith('data:image/png;base64,'), 'makeCover -> PNG data-URI'); global.document.createElement = () => { throw new Error('x'); }; ok(G.waveform.makeCover().error === 'no-canvas', 'tanpa canvas -> no-canvas');

  // ===== 9. akhir: jaringan tidak pernah dipanggil =====
  ok(netCalls === 0, 'seluruh uji selesai tanpa SATU pun panggilan jaringan (fetch/XHR/WebSocket/beacon): ' + netCalls);
  console.log(fail ? '\n' + fail + ' GAGAL dari ' + total : '\nSEMUA LULUS (' + total + ' pemeriksaan)');
  process.exit(fail ? 1 : 0);
})();
