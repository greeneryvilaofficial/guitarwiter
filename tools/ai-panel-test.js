// Uji PANEL: menjalankan blok skrip AI dari www/index.html di DOM tiruan (tanpa jsdom) dan mengetuk tombol-tombolnya.
// Jalankan: node tools/ai-panel-test.js
const fs = require('fs'), path = require('path'), WWW = path.join(__dirname, '..', 'www'); const FAIL = process.env.FAIL_MODULE || '';
const HTML = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
let fail = 0, total = 0; const ok = (c, m) => { total++; if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };

// ---- DOM tiruan minimal ----
const byId = {}; const listeners = {};
class El { constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this._text = ''; this._id = ''; this.handlers = {}; this.options = []; this.value = ''; this.className = ''; this.attrs = {}; }
  set id(v) { this._id = v; byId[v] = this; } get id() { return this._id; }
  set textContent(v) { this._text = String(v); if (this.tag === 'option') {} } get textContent() { return this._text; }
  appendChild(c) { this.children.push(c); if (this.tag === 'select' && c.tag === 'option') this.options.push(c); if (c.tag === 'script') loadScript(c); return c; }
  addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }
  click() { (this.handlers.click || []).forEach(f => f({})); }
  getContext() { return { clearRect() {}, fillRect() {}, fillText() {}, createLinearGradient: () => ({ addColorStop() {} }), beginPath() {}, arc() {}, stroke() {}, moveTo() {}, quadraticCurveTo() {} }; }
  toDataURL() { return 'data:image/png;base64,AAAA'; } set src(v) { this._src = v; } get src() { return this._src; }
  scrollTop = 0; }
const head = new El('head'), body = new El('body');
function loadScript(el) { setTimeout(() => { if (FAIL && el.src === FAIL) { el.onerror && el.onerror(); return; } try { (0, eval)(fs.readFileSync(path.join(WWW, el.src), 'utf8')); el.onload && el.onload(); } catch (e) { console.log('muat gagal', el.src, e.message); el.onerror && el.onerror(); } }, 0); }
global.window = global; const ls = { genjreng_prefs_v1: JSON.stringify({ ai: true }), meta_key: 'LAMA', gwai_cfg_v1: '{}', gwai_wonder_quota: '{}' };
global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
let net = 0; global.fetch = () => { net++; throw new Error('JARINGAN'); }; global.alert = m => { global.__alert = m; };
global.document = { head, body, createElement: t => new El(t), getElementById: id => byId[id] || null, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: e => { (listeners[e.type] || []).forEach(f => f(e)); return true; } };
global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }; global.atob = s => Buffer.from(s, 'base64').toString('binary');
let nativeHook = null, hum = { rec: false }; global.AndroidKeyboard = { setWaveformHook: b => { nativeHook = b; }, startHumCapture: () => { hum.rec = true; return true; }, stopHumCapture: () => { hum.rec = false; }, humSeconds: () => 30, getLast30SecAudio: () => hum.wav };

// ---- jalankan blok AI persis seperti di index.html ----
const a = HTML.indexOf('[LABEL AI / v1.5.0 / OFFLINE]'), s0 = HTML.indexOf('<script>', a) + 8, s1 = HTML.indexOf('</script>', s0);
(0, eval)(HTML.slice(s0, s1));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const tick = () => sleep(30);
const wait = async (cond, ms = 4000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(20); return cond(); };

(async () => {
  if (FAIL) {   // mode diagnosis: satu modul sengaja "tidak ada" di aplikasi
    window.gwaiOpen(); await wait(() => byId['gwai-status'] && /gagal/.test(byId['gwai-status'].textContent)); await tick();
    ok(byId['gwai-status'].textContent.includes(FAIL) && /gagal di/.test(byId['gwai-status'].textContent), 'status panel menyebut berkas yang gagal: ' + byId['gwai-status'].textContent);
    ok(byId['tab-output'].textContent.includes(FAIL) && byId['tab-output'].textContent.includes('www/ai') && byId['tab-output'].textContent.includes('push'), 'pesan menjelaskan penyebab (folder www/ai belum di-push/di-build)');
    const b = []; const w = e => { if (e.tag === 'button' && e.textContent === 'Bluesy') b.push(e); e.children.forEach(w); }; w(byId['gwaiPanel']); b[0].click(); await tick(); await tick();
    ok(byId['gwai-cmdres'].textContent.includes(FAIL), 'ketuk tombol saat modul hilang: pesan jelas, tidak error');
    const d = window.gwaiDiag(); ok(d.loaded === false && d.failed === FAIL && d.count < d.total, 'gwaiDiag(): ' + JSON.stringify(d));
    console.log(fail ? '\n' + fail + ' GAGAL' : '\nSEMUA LULUS (diagnosis)'); process.exit(fail ? 1 : 0);
  }
  ok(!('meta_key' in ls) && !('gwai_cfg_v1' in ls) && !('gwai_wonder_quota' in ls), 'saat dimuat: kunci/konfigurasi online lama dihapus dari localStorage');
  ok(typeof window.gwaiOpen === 'function' && typeof window.onSparkTrigger === 'function' && typeof window.generateFullSong === 'function' && typeof window.metaGenerate === 'function', 'fungsi publik tersedia (gwaiOpen, onSparkTrigger, generateFullSong, metaGenerate)');
  window.gwaiOpen(); await wait(() => window.GWAI && window.GWAI.waveform && byId['gwai-songs'] && byId['gwai-songs'].options.length > 0); await tick();
  ok(!!byId['gwaiPanel'] && byId['gwaiPanel'].style.display === 'block' && nativeHook === true, 'panel terbuka, hook waveform native dinyalakan');
  ok(byId['gwai-songs'].options.length === 9 && byId['gwai-songs'].options[0].textContent.includes('Twinkle'), 'perpustakaan: 9 pilihan terisi');
  const texts = []; const walk = e => { texts.push(e.textContent); e.children.forEach(walk); }; walk(byId['gwaiPanel']); const all = texts.join('\n');
  ok(!/API Key|Endpoint|Test Connection|Kunci|Wonder \(berbayar\)|Kirim ke Wonder/.test(all) && all.includes('OFFLINE'), 'panel: tidak ada kolom kunci/endpoint/Test Connection/kuota; ada tanda OFFLINE');
  // tab aktif kosong -> perintah memakai riff contoh
  const click = lab => { const f = []; const w = e => { if (e.tag === 'button' && e.textContent === lab) f.push(e); e.children.forEach(w); }; w(byId['gwaiPanel']); return f[0]; };
  click('Bluesy').click(); await tick(); ok(byId['gwai-cmdres'].textContent.startsWith('✓ bluesy') && byId['tab-output'].textContent.includes('Bluesy') && /\n *E\|/.test(byId['tab-output'].textContent), 'chip Bluesy: tab contoh diubah, hasil tampil di panel');
  byId['gwai-cmd'].value = 'lebih cepat dan naikin 2 nada'; click('Terapkan').click(); await tick(); ok(byId['gwai-cmdres'].textContent.includes('cepat + naik') && byId['tab-output'].textContent.includes('F#'), 'kolom perintah: "lebih cepat dan naikin 2 nada" -> cepat + naik, kunci F#');
  byId['gwai-cmd'].value = 'halo dunia'; click('Terapkan').click(); await tick(); ok(byId['gwai-cmdres'].textContent.includes('✗') && byId['gwai-cmdres'].textContent.includes('Coba:'), 'perintah tak dikenal -> pesan + saran');
  click('↶ Batalkan').click(); await tick(); ok(/F#|E/.test(byId['tab-output'].textContent), 'Batalkan memulihkan tab sebelumnya');
  // chord -> lagu
  byId['gwai-chords'].value = 'Em C G D'; click('Buat lagu').click(); await tick();
  ok(byId['gwai-lirik'].textContent.includes('[Verse 1]') && byId['gwai-lirik'].textContent.includes('galau') && byId['gwai-band'].textContent.includes('BASS') && byId['gwai-band'].textContent.includes('DRUM') && byId['tab-output'].textContent.includes('Verse 1'), 'Buat lagu: lirik berakor + bass + drum tampil, tab aktif = lagu');
  const lir1 = byId['gwai-lirik'].textContent; click('Variasi lain').click(); await tick(); ok(byId['gwai-lirik'].textContent !== lir1, 'Variasi lain: lirik berbeda');
  click('Suasana: ceria').click(); click('Buat lagu').click(); await tick(); ok(byId['gwai-lirik'].textContent.includes('ceria'), 'pilihan suasana Ceria dipakai');
  byId['gwai-chords'].value = 'Em Hx G'; click('Buat lagu').click(); await tick(); ok(byId['gwai-lirik'].textContent.includes('✗') && byId['gwai-lirik'].textContent.includes('Hx'), 'akor salah -> pesan menyebut "Hx"');
  // perpustakaan
  byId['gwai-songs'].value = 'birthday'; click('Buka tab').click(); await tick(); ok(byId['gwai-note'].textContent.includes('Selamat Ulang Tahun') && byId['tab-output'].textContent.includes('Selamat Ulang Tahun'), 'Buka tab: Selamat Ulang Tahun tampil');
  // sampul + SAM
  click('Sampul lagu (Image)').click(); await tick(); ok(byId['gwai-cover'].src.startsWith('data:image/png') && byId['gwai-cover'].style.display === 'block', 'sampul digambar lokal dan ditampilkan');
  click('Segmentasi frasa (SAM)').click(); await tick(); ok(byId['gwai-note'].textContent.includes('✗'), 'segmentasi tanpa rekaman -> pesan rapi');
  // humming (native tiruan): WAV 16 kHz melodi A minor
  const wav = (spec, rate = 16000) => { const total = Math.round(spec.reduce((a, x) => a + x[1], 0) * rate), s = new Int16Array(total); let p = 0, ph = 0; for (const [m, sec] of spec) { const n = Math.round(sec * rate); for (let i = 0; i < n; i++) { let v = 0; if (m) { ph += 2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) / rate; v = (Math.sin(ph) + .5 * Math.sin(2 * ph) + .3 * Math.sin(3 * ph)) * .35 * Math.min(1, i / 400, (n - i) / 400); } v += (((p + i) * 9301 + 49297) % 233280 / 233280 - .5) * .02; s[p + i] = Math.round(v * 20000); } p += n; } const b = Buffer.alloc(44 + total * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + total * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(total * 2, 40); for (let i = 0; i < total; i++) b.writeInt16LE(s[i], 44 + 2 * i); return b.toString('base64'); };
  const sp = [[0, .3]]; [57, 60, 64, 62, 60, 57, 59, 64, 60, 57, 59, 60, 62, 60, 59, 57].forEach(m => sp.push([m, .5], [0, .08])); hum.wav = wav(sp);
  const realSetInterval = global.setInterval; global.setInterval = (f, ms) => realSetInterval(f, 1);   // 30 dtk -> 30 ms
  window.generateFullSong(); await wait(() => byId['full-song'].textContent.startsWith('Bersenandung')); ok(hum.rec === true && byId['gwai-wonder'].textContent.includes('Merekam'), 'ketuk humming: rekam native dimulai, tombol menghitung mundur');
  await wait(() => byId['full-song'].textContent.startsWith('♪'), 8000); const fs1 = byId['full-song'].textContent;
  ok(fs1.includes('Kunci Am') && /· \d+ bpm · [23]:\d\d ·/.test(fs1) && fs1.includes('Verse 1 › Chorus') && hum.rec === false, 'humming selesai: "' + fs1.split('\n')[1] + '"');
  ok(byId['gwai-lirik'].textContent.includes('[Chorus]') && byId['tab-output'].textContent.includes('Lagu Humming'), 'lirik berakor + tab lagu humming tampil');
  global.setInterval = realSetInterval;
  window.generateFullSong(); await tick(); ok(true, 'ketukan humming kedua tidak error'); window.generateFullSong(); await tick();
  // Intent dari native
  window.onSparkTrigger('bluesy'); await tick(); ok(byId['gwai-cmdres'].textContent.startsWith('✓ bluesy'), 'onSparkTrigger("bluesy") dari native -> Spark offline');
  const before = byId['gwai-cmdres'].textContent; window.onSparkTrigger('<img onerror=x>'); window.onSparkTrigger('hapus-semua'); await tick(); ok(byId['gwai-cmdres'].textContent === before, 'preset di luar allowlist diabaikan');
  // tema: gaya panel memakai variabel tema keyboard, bukan warna manual
  const css = head.children.map(c => c.textContent).filter(x => x.includes('#gwaiPanel')).join('\n'), used = [...new Set([...css.matchAll(/var\((--[a-z-]+)/g)].map(m => m[1]))];
  const defined = n => new RegExp('\\n\\s*' + n + '\\s*:').test(HTML);
  ok(used.length >= 12 && used.every(defined), 'CSS panel memakai ' + used.length + ' variabel tema dan semuanya didefinisikan di :root keyboard (' + used.filter(n => !defined(n)).join(',') + ')');
  ok(['--kb-bg', '--key-bg', '--key-fn-bg', '--key-text', '--key-tag', '--key-enter-bg', '--divider', '--muted', '--pill-bg', '--key-radius'].every(v => used.includes(v)), 'latar = --kb-bg, tombol = --key-bg, aksen = --key-tag, garis = --divider, sudut = --key-radius (sama seperti keyboard)');
  ok(!/#[0-9a-fA-F]{3,6}\b|Canvas|rgb/.test(css.replace(/rgba?\(0,0,0/g, '')), 'tidak ada warna yang ditulis manual (hex/rgb/Canvas) di CSS panel');
  ok(['dark', 'light', 'blue', 'purple', 'green'].every(th => th === 'dark' || new RegExp('body\\.theme-' + th + '\\{[^}]*--kb-bg').test(HTML)), 'tema Terang/Biru/Ungu/Hijau mendefinisikan --kb-bg yang sama yang dipakai panel');
  // keterbacaan: kontras WCAG semua pasangan warna panel di kelima tema (dihitung dari variabel di index.html)
  const grab = sel => { const i = HTML.indexOf(sel), j = HTML.indexOf('}', i), o = {}; for (const m of HTML.slice(i, j).matchAll(/(--[a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) o[m[1]] = m[2]; return o; };
  const root = grab(':root{'), TH = { dark: root }; for (const th of ['light', 'blue', 'purple', 'green']) TH[th] = Object.assign({}, root, grab('body.theme-' + th + '{'));
  const lum = c => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const need = { 'teks utama': ['--key-text', '--kb-bg', 7], 'tombol': ['--key-text', '--key-bg', 7], 'kotak/input': ['--key-text', '--key-fn-bg', 7], 'chip': ['--key-text', '--pill-bg', 7], 'petunjuk': ['--muted', '--kb-bg', 4.5], 'judul bagian': ['--key-tag', '--kb-bg', 3.5] };
  const low = []; for (const [th, v] of Object.entries(TH)) { for (const [l, [f, b, min]] of Object.entries(need)) if (cr(v[f], v[b]) < min) low.push(th + '/' + l + '=' + cr(v[f], v[b]).toFixed(1));
    const onFg = th === 'light' ? v['--key-bubble-text'] : v['--kb-bg']; if (cr(onFg, v['--key-enter-bg']) < 4.5) low.push(th + '/chip aktif=' + cr(onFg, v['--key-enter-bg']).toFixed(1)); }
  ok(low.length === 0, 'kontras teks panel di 5 tema: teks/tombol/kotak/chip >= 7:1, petunjuk >= 4,5:1, chip aktif >= 4,5:1, judul >= 3,5:1' + (low.length ? ' -> RENDAH: ' + low : ''));
  ok(/body\.theme-light #gwaiPanel \.chips button\.on/.test(css), 'tema Terang: chip aktif memakai teks putih (pengecualian kontras)');
  window.onWaveformClick(329.63, 40); window.gwaiClose(); ok(byId['gwaiPanel'].style.display === 'none' && nativeHook === false, 'tutup: panel tersembunyi, hook native dimatikan lagi');
  ok(net === 0, 'seluruh alur panel selesai tanpa panggilan jaringan: ' + net);
  ok(/Modul: 8\/8 dimuat/.test(byId['gwai-status'].textContent) && window.gwaiDiag().loaded === true, 'status panel normal: "' + byId['gwai-status'].textContent + '"');
  for (const m of ['ai/ai-core.js', 'ai/songs.js', 'ai/waveform.js']) { const c = require('child_process').spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { FAIL_MODULE: m }), encoding: 'utf8' }); ok(c.status === 0 && /SEMUA LULUS \(diagnosis\)/.test(c.stdout), 'modul hilang (' + m + '): panel mendiagnosis dengan benar' + (c.status === 0 ? '' : '\n' + c.stdout.split('\n').filter(l => /GAGAL/.test(l)).join('\n'))); }
  console.log(fail ? '\n' + fail + ' GAGAL dari ' + total : '\nSEMUA LULUS (' + total + ' pemeriksaan panel)'); process.exit(fail ? 1 : 0);
})();
