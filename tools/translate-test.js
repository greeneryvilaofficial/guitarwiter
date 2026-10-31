// Uji modul terjemah src/lib (tanpa dependency): node tools/translate-test.js
// fetch dan jembatan Llama dipalsukan; tidak ada jaringan sungguhan.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LIB = path.join(ROOT, 'src', 'lib');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0, total = 0; const ok = (c, m) => { total++; if (!c) { fail++; console.log('GAGAL:', m); } else console.log('ok   :', m); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---------- 1. pemindaian statis: hanya online/spark.js yang boleh menyentuh jaringan ----------
  const files = walk(LIB), rel = f => path.relative(LIB, f).replace(/\\/g, '/');
  const NET = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'https://', 'http://', 'Authorization'];
  const offenders = files.filter(f => rel(f) !== 'online/spark.js').flatMap(f => NET.filter(w => fs.readFileSync(f, 'utf8').includes(w)).map(w => rel(f) + ':' + w));
  ok(files.length === 7 && offenders.length === 0, 'semua berkas src/lib selain online/spark.js bebas fetch/XHR/WebSocket/URL/Authorization' + (offenders.length ? ' -> ' + offenders : ''));
  const sparkSrc = fs.readFileSync(path.join(LIB, 'online', 'spark.js'), 'utf8');
  ok((sparkSrc.match(/https:\/\//g) || []).length >= 1 && !/http:\/\//.test(sparkSrc), 'spark.js hanya memuat alamat https');
  ok(!/localStorage\.(get|set)Item\('meta_key'/.test(files.map(f => fs.readFileSync(f, 'utf8')).join('')), 'tidak memakai kunci lama meta_key');

  // ---------- lingkungan palsu ----------
  global.window = global; const ls = {};
  global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
  let fetchCalls = [], fetchImpl = null; global.fetch = (u, i) => { fetchCalls.push({ u, i }); return fetchImpl(u, i); };
  const mkResp = (status, obj) => Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  for (const f of ['core', 'offline/dict-data', 'offline/dict-engine', 'offline/llama', 'online/spark', 'router', 'ui/translate-panel']) { try { (0, eval)(fs.readFileSync(path.join(LIB, f + '.js'), 'utf8')); } catch (e) { if (f !== 'ui/translate-panel') throw e; } }
  const T = global.GWTR, C = T.core;
  ok(!!(T.core && T.dict && T.llama && T.spark && T.translate), 'semua modul termuat (core, dict, llama, spark, router)');

  // ---------- 2. kamus offline ----------
  const d = (s, a, b) => T.dict.translate(s, a, b);
  ok(d('Terima kasih, saya makan nasi di sini.', 'id', 'su').text === 'Hatur nuhun, abdi dahar sangu di dieu.', 'kamus id→su: frasa, tanda baca, huruf kapital');
  ok(d('Selamat pagi, kamu mau minum air?', 'id', 'jv').text === 'Sugeng enjing, kowe péngin ngombe banyu?', 'kamus id→jv');
  ok(d('thank you, good morning', 'en', 'id').text === 'terima kasih, selamat pagi', 'kamus en→id (frasa 2 kata)');
  ok(d('hade', 'su', 'id').text === 'baik', 'aksen diabaikan saat mencari (hade = hadé)');
  const unk = d('xyz qrs', 'id', 'en'); ok(unk.ok && unk.coverage === 0 && unk.unknown.length === 2 && unk.text === 'xyz qrs', 'kata asing dibiarkan dan dilaporkan (coverage 0)');
  ok(d('', 'id', 'en').error === 'empty' && d('a', 'id', 'id').error === 'same-lang' && d('a', 'id', 'xx').error === 'bad-lang' && d('x'.repeat(501), 'id', 'en').error === 'too-long', 'validasi input: kosong / bahasa sama / bahasa asing / terlalu panjang');
  const rows = T.dictRows; ok(rows.every(r => r.length === 4 && r.every(x => x && x.trim())), 'kamus benih: ' + rows.length + ' baris, semua 4 kolom terisi');

  // ---------- 3. Llama offline (jembatan palsu) ----------
  const L = T.llama;
  ok(L.status().available === false && L.status().reason === 'no-bridge', 'tanpa jembatan: status no-bridge, available=false');
  const p = L.buildPrompt('Halo', 'id', 'en');
  ok(p.startsWith('<|start_header_id|>system<|end_header_id|>') && p.includes('Indonesian to English') && p.endsWith('<|start_header_id|>assistant<|end_header_id|>\n\n') && p.includes('<|eot_id|>') && !p.includes('<|begin_of_text|>') && L.buildPrompt('a', 'id', 'en', { includeBos: true }).startsWith('<|begin_of_text|>'), 'templat chat Llama 3 benar (BOS opsional)');
  let r = await L.translate('Halo', 'id', 'en'); ok(!r.ok && r.error === 'llama-unavailable', 'tanpa jembatan: translate() gagal jujur, TIDAK berpura-pura');
  const mkBridge = st => { const b = { calls: [], status: () => JSON.stringify(st), generateAsync(id, prompt, n) { b.calls.push({ id, prompt, n }); return ''; } }; return b; };
  global.AndroidLlama = mkBridge({ nativeLib: false, modelPresent: true, modelPath: '/x', modelBytes: 1 }); ok(L.status().reason === 'no-native-lib', 'pustaka native tidak ada -> no-native-lib');
  global.AndroidLlama = mkBridge({ nativeLib: true, modelPresent: false, modelPath: '/sdcard/models' }); ok(L.status().reason === 'no-model' && L.status().text.includes('/sdcard/models'), 'model tidak ada -> no-model + lokasi folder');
  const br = global.AndroidLlama = mkBridge({ nativeLib: true, modelPresent: true, modelPath: '/m.gguf', modelBytes: 800 * 1048576 }); ok(L.status().available, 'pustaka + model ada -> available');
  let pr = L.translate('Selamat pagi', 'id', 'en'); await sleep(5);
  ok(br.calls.length === 1 && br.calls[0].prompt.includes('Selamat pagi') && br.calls[0].n >= 16 && br.calls[0].n <= 256, 'generateAsync dipanggil dengan prompt + batas token');
  const busy = await L.translate('lagi', 'id', 'en'); ok(busy.error === 'busy', 'permintaan kedua saat sibuk -> busy (tanpa antre)');
  global.__gwLlamaResult(br.calls[0].id, JSON.stringify({ ok: true, text: 'Translation: "Good morning"' })); r = await pr;
  ok(r.ok && r.text === 'Good morning' && r.engine === 'llama', 'hasil Llama dibersihkan (label & tanda kutip) dan engine=llama');
  pr = L.translate('Halo', 'id', 'en'); await sleep(5); global.__gwLlamaResult(br.calls[1].id, JSON.stringify({ ok: false, error: 'native-lib-missing' })); r = await pr;
  ok(!r.ok && r.error === 'llama-failed', 'galat native diteruskan sebagai llama-failed');
  pr = L.translate('Halo', 'id', 'en', { timeoutMs: 30 }); r = await pr; ok(r.error === 'timeout', 'timeout ditangani, tidak menggantung');
  global.__gwLlamaResult(999, '{"ok":true,"text":"x"}'); ok(true, 'hasil untuk id tak dikenal diabaikan tanpa galat');

  // ---------- 4. Muse Spark online ----------
  const S = T.spark;
  ok(S.isOn() === false && !S.hasKey(), 'bawaan: online MATI dan tanpa kunci');
  r = await S.translate('Halo', 'id', 'en'); ok(r.error === 'online-disabled' && fetchCalls.length === 0, 'mati -> online-disabled, 0 permintaan jaringan');
  S.enable(true); r = await S.translate('Halo', 'id', 'en'); ok(r.error === 'no-key' && fetchCalls.length === 0, 'tanpa kunci -> no-key, 0 permintaan jaringan');
  ok(!S.setKey('pendek').ok && !S.setKey('ada spasi di sini 12345').ok && S.setKey('mk-TESTKEY-1234567890').ok && S.hasKey() && S.keyHint().endsWith('7890') && !S.keyHint().includes('TESTKEY'), 'validasi kunci; petunjuk hanya menampilkan 4 karakter terakhir');
  const okEp = ['https://api.meta.ai/v1/chat/completions', 'https://meta.ai/v1/x', 'https://eu.api.meta.ai/v1/chat/completions'], badEp = ['http://api.meta.ai/v1/chat/completions', 'https://evil.com/v1', 'https://api.meta.ai.evil.com/v1', 'https://user:pw@api.meta.ai/v1', 'https://api.meta.ai/v1?x=1', 'https://api.meta.ai/v1#h', 'https://api.meta.ai/v 1', 'ftp://api.meta.ai', ''];
  ok(okEp.every(S.checkEndpoint) && badEp.every(u => !S.checkEndpoint(u)), 'endpoint: hanya https + host meta.ai (http, host lain, user:pass, query, hash, spasi ditolak)');
  ok(!S.setConfig({ endpoint: 'https://evil.com/x' }).ok && S.getConfig().endpoint === S.DEFAULTS.endpoint, 'endpoint buruk ditolak dan tidak tersimpan');
  const rq = S.buildRequest('Halo dunia', 'id', 'en'), body = JSON.parse(rq.init.body);
  ok(rq.url === 'https://api.meta.ai/v1/chat/completions' && rq.init.method === 'POST' && rq.init.headers.Authorization === 'Bearer mk-TESTKEY-1234567890', 'permintaan: URL resmi, POST, Bearer di header');
  ok(!rq.url.includes('TESTKEY') && !rq.init.body.includes('TESTKEY'), 'kunci TIDAK ada di URL maupun badan permintaan');
  ok(body.model === 'muse-spark-1.2' && body.max_completion_tokens === 512 && body.messages.length === 2 && body.messages[1].content === 'Halo dunia' && body.messages[0].content.includes('Indonesian to English') && body.reasoning_effort === 'minimal' && !('audio' in body), 'badan: model, batas token keluaran, pesan sistem+pengguna, hanya teks');
  fetchImpl = () => mkResp(200, { choices: [{ message: { content: 'Hello world' } }] });
  r = await S.translate('Halo dunia', 'id', 'en'); ok(r.ok && r.text === 'Hello world' && r.engine === 'spark' && fetchCalls.length === 1, 'sukses: teks terbaca, engine=spark, tepat 1 permintaan');
  r = await S.translate('lagi', 'id', 'en'); ok(r.error === 'too-fast' && fetchCalls.length === 1, 'jeda minimal 1 detik: permintaan beruntun ditolak sebelum dikirim');
  const cases = [[401, 'key-rejected'], [403, 'key-rejected'], [404, 'endpoint-404'], [400, 'bad-request'], [422, 'bad-request'], [429, 'rate-limited'], [500, 'server-error'], [503, 'server-error'], [418, 'http-418']];
  for (const [st, er] of cases) { await sleep(1010); fetchImpl = () => mkResp(st, { error: { message: 'pesan dari server ' + 'x'.repeat(400) } }); r = await S.translate('Halo', 'id', 'en'); ok(!r.ok && r.error === er && r.detail.length <= 200, 'HTTP ' + st + ' -> ' + er + ' (detail ≤ 200 karakter)'); }
  await sleep(1010); fetchImpl = () => Promise.reject(new TypeError('Failed to fetch')); r = await S.translate('Halo', 'id', 'en'); ok(r.error === 'network', 'jaringan putus -> network (tidak melempar)');
  await sleep(1010); fetchImpl = () => mkResp(200, { choices: [] }); r = await S.translate('Halo', 'id', 'en'); ok(r.error === 'empty-answer', 'jawaban kosong -> empty-answer');
  await sleep(1010); fetchImpl = (u, i) => new Promise((res, rej) => i.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); })); S.setConfig({}); ls.gw_spark_cfg = JSON.stringify({}); 
  const realST = global.setTimeout; global.setTimeout = (f, ms) => realST(f, ms === 20000 ? 40 : ms); r = await S.translate('Halo', 'id', 'en'); global.setTimeout = realST; ok(r.error === 'timeout', 'server tak menjawab -> timeout (AbortController)');
  await sleep(1010); fetchImpl = () => mkResp(200, { choices: [{ message: { content: [{ type: 'text', text: 'Bagian ' }, { type: 'text', text: 'dua' }] } }] }); r = await S.translate('Halo', 'id', 'en'); ok(r.ok && r.text === 'Bagian dua', 'konten berbentuk array bagian dibaca');
  S.clearKey(); ok(!S.hasKey() && !('gw_spark_key' in ls), 'hapus kunci benar-benar menghapus dari penyimpanan');

  // ---------- 5. router ----------
  const n0 = fetchCalls.length; S.enable(true); S.setKey('mk-TESTKEY-1234567890');
  global.AndroidLlama = undefined; r = await T.translate('Terima kasih', 'id', 'su', { engine: 'auto' });
  ok(r.ok && r.engine === 'dict' && r.fellBack === true && r.text === 'Hatur nuhun', 'auto tanpa Llama -> kamus, ditandai fellBack');
  global.AndroidLlama = mkBridge({ nativeLib: true, modelPresent: true, modelPath: '/m', modelBytes: 1 }); const rb = global.AndroidLlama;
  let ap = T.translate('Terima kasih', 'id', 'en'); await sleep(5); global.__gwLlamaResult(rb.calls[0].id, JSON.stringify({ ok: true, text: 'Thank you' })); r = await ap; ok(r.engine === 'llama' && r.text === 'Thank you' && !r.fellBack, 'auto dengan Llama siap -> engine=llama');
  ap = T.translate('Terima kasih', 'id', 'en'); await sleep(5); global.__gwLlamaResult(rb.calls[1].id, JSON.stringify({ ok: false, error: 'x' })); r = await ap; ok(r.engine === 'dict' && r.fellBack && r.llamaError === 'llama-failed', 'auto: Llama gagal -> kamus, galat Llama dilaporkan');
  ok(fetchCalls.length === n0, 'mode auto TIDAK PERNAH memakai jaringan, walau online dinyalakan dan kunci ada');
  r = await T.translate('Halo', 'id', 'en', { engine: 'dict' }); ok(r.engine === 'dict' && (await T.translate('a', 'id', 'en', { engine: 'zzz' })).error === 'bad-engine', 'engine eksplisit dict / engine tidak dikenal');

  // ---------- 6. integrasi index.html, sw.js, build ----------
  const HTML = rd('www/index.html'), SW = rd('www/sw.js'), trm = /var TR_MODS = \[([^\]]+)\]/.exec(HTML);
  const mods = trm ? trm[1].match(/lib\/[a-z\/-]+\.js/g) : [];
  ok(mods.length === 7 && mods.every(m => fs.existsSync(path.join(LIB, m.slice(4))) && fs.existsSync(path.join(ROOT, 'www', m)) && SW.includes("'" + m + "'")), 'index.html memuat 7 modul lib: ada di src/lib, di www/lib, dan di cache sw.js');
  ok(mods.every(m => fs.readFileSync(path.join(LIB, m.slice(4)), 'utf8') === rd('www/' + m)), 'www/lib identik dengan src/lib');
  const blk = HTML.slice(HTML.indexOf('[LABEL AI / v1.5.0 / OFFLINE]'));
  ok(/gwTranslateOpen/.test(blk) && !/fetch\(|api\.meta|Authorization/.test(blk), 'blok AI hanya punya tombol + pemuat; tidak ada kode jaringan di index.html');
  ok((HTML.match(/loadTranslate\(/g) || []).length === 2 && /btn\('Buka Terjemah', function\(\)\{ loadTranslate\(\)/.test(HTML), 'loadTranslate() hanya didefinisikan + dipanggil dari tombol "Buka Terjemah" (modul online tidak dimuat saat start)');
  ok(JSON.parse(rd('package.json')).version === '1.6.0', 'package.json versi 1.6.0');
  ok(fs.existsSync(path.join(ROOT, 'native-patches', 'LlamaBridge.java')) && rd('native-patches/HtmlKeyboardService.java').includes('"AndroidLlama"') && /LlamaBridge\.java/.test(rd('.github/workflows/android-build.yml')) && /build:web|sync-lib/.test(rd('.github/workflows/android-build.yml')), 'build: LlamaBridge disalin, didaftarkan sebagai AndroidLlama, lib disinkronkan di workflow');
  ok(rd('.github/workflows/android-build.yml') === rd('workflows/android-build.yml'), '.github/workflows dan workflows/ identik');

  // ---------- 7. panel (DOM tiruan) ----------
  const byId = {}; class El { constructor(t) { this.tag = t; this.children = []; this.style = {}; this._text = ''; this.handlers = {}; this.value = ''; this.className = ''; this.disabled = false; }
    set id(v) { this._id = v; byId[v] = this; } get id() { return this._id; } set textContent(v) { this._text = String(v); } get textContent() { return this._text; }
    appendChild(c) { this.children.push(c); return c; } addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); } click() { (this.handlers.click || []).forEach(f => f({})); } }
  global.document = { head: new El('head'), body: new El('body'), createElement: t => new El(t), getElementById: id => byId[id] || null };
  delete global.gwTranslateOpen; (0, eval)(fs.readFileSync(path.join(LIB, 'ui', 'translate-panel.js'), 'utf8'));
  ok(typeof global.gwTranslateOpen === 'function', 'panel terdaftar (gwTranslateOpen)');
  global.AndroidLlama = undefined; S.clearKey(); S.enable(false); global.gwTranslateOpen();
  ok(byId.gwTrPanel.style.display === 'block' && /Llama offline: belum siap/.test(byId['gwtr-status'].textContent) && /Spark online: mati/.test(byId['gwtr-status'].textContent) && /kunci belum ada/.test(byId['gwtr-status'].textContent), 'panel menampilkan status jujur: Llama belum siap, Spark mati, kunci belum ada');
  byId['gwtr-in'].value = 'Terima kasih'; byId['gwtr-from'].value = 'id'; byId['gwtr-to'].value = 'jv'; byId['gwtr-go'].click(); await sleep(20);
  ok(byId['gwtr-out'].textContent === 'Matur nuwun' && /Kamus offline/.test(byId['gwtr-note'].textContent) && /Llama belum siap/.test(byId['gwtr-note'].textContent), 'klik Terjemahkan: hasil kamus + keterangan mesin + alasan fallback');
  const bn = n => { const q = [byId.gwTrPanel]; while (q.length) { const e = q.shift(); if (e.tag === 'button' && e._text === n) return e; q.push(...e.children); } };
  const spBtn = bn('Spark online'); spBtn.click(); byId['gwtr-go'].click(); await sleep(20);
  ok(/Mode online belum dinyalakan/.test(byId['gwtr-note'].textContent) && fetchCalls.length === n0, 'pilih Spark saat mati: pesan jelas, 0 jaringan');
  const walkEls = e => [e].concat(...e.children.map(walkEls)); ok(walkEls(byId.gwTrPanel).filter(e => e.tag === 'input' && e.type === 'password').length === 1, 'kolom kunci bertipe password');

  console.log(fail ? '\n' + fail + ' dari ' + total + ' GAGAL' : '\nSEMUA LULUS (' + total + ' pemeriksaan terjemah)'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR UJI:', e); process.exit(1); });
