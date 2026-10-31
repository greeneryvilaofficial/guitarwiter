/* ============================================================================================
 * [LABEL GWTR / PANEL] src/lib/ui/translate-panel.js
 * Panel "Terjemah": pilih bahasa + mesin (Otomatis / Llama offline / Kamus offline / Spark online).
 * Warna 100% dari variabel CSS keyboard (ikut tema). Keluaran selalu lewat textContent.
 * window.gwTranslateOpen() / window.gwTranslateClose()
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || !NS.translate || root.gwTranslateOpen) return;
  var C = NS.core, doc = root.document, panel = null, engine = 'auto', last = null;

  var MSG = {
    'empty': 'Ketik teks dulu.', 'same-lang': 'Bahasa asal dan tujuan sama.', 'too-long': 'Terlalu panjang (maks ' + C.MAX_CHARS + ' karakter).',
    'llama-unavailable': 'Llama offline belum siap di HP ini.', 'online-disabled': 'Mode online belum dinyalakan.', 'no-key': 'Belum ada kunci API.',
    'key-rejected': 'Kunci ditolak server (401/403).', 'endpoint-404': 'Alamat endpoint tidak ditemukan (404).', 'bad-request': 'Permintaan ditolak (400/422): cek nama model atau kosongkan "reasoning".',
    'rate-limited': 'Kena batas laju (429). Tunggu sebentar.', 'server-error': 'Server sedang bermasalah (5xx).', 'timeout': 'Waktu habis.', 'network': 'Tidak ada koneksi.',
    'busy': 'Masih memproses permintaan sebelumnya.', 'too-fast': 'Terlalu cepat; tunggu 1 detik.', 'bad-key': 'Kunci tidak valid.', 'bad-endpoint': 'Endpoint tidak valid.'
  };
  function msg(r) { var m = MSG[r.error] || ('Gagal: ' + r.error); return r.detail ? m + ' (' + r.detail + ')' : m; }
  function $(id) { return doc.getElementById(id); }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }

  function build() {
    var css = doc.createElement('style');
    css.textContent =
      '#gwTrPanel{position:absolute;inset:0;z-index:80;overflow:auto;padding:12px;box-sizing:border-box;background:var(--kb-bg);color:var(--key-text);font-family:Roboto,system-ui,sans-serif;font-size:.95rem}' +
      '#gwTrPanel .gw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--divider)}' +
      '#gwTrPanel .gw-title{font-size:1rem;font-weight:700}#gwTrPanel .gw-title b{color:var(--key-tag)}' +
      '#gwTrPanel button{margin:3px 4px 3px 0;padding:9px 12px;border:var(--key-border,none);border-radius:var(--key-radius,8px);background:var(--key-bg);color:var(--key-text);font:inherit;box-shadow:0 1px 0 var(--shadow)}' +
      '#gwTrPanel button:active{background:var(--key-active-bg)}#gwTrPanel button:disabled{opacity:.5}#gwTrPanel button.fn{background:var(--key-fn-bg);margin:0}' +
      '#gwTrPanel .chips button{border-radius:999px;background:var(--pill-bg);padding:7px 13px;font-size:.9rem}' +
      '#gwTrPanel .chips button.on{background:var(--key-enter-bg);color:var(--kb-bg);font-weight:600}body.theme-light #gwTrPanel .chips button.on{color:var(--key-bubble-text)}' +
      '#gwTrPanel h4{margin:14px 0 4px;font-size:.85rem;font-weight:700;color:var(--key-tag)}#gwTrPanel .hint{font-size:.75rem;color:var(--muted);margin:0 0 6px;white-space:pre-wrap}' +
      '#gwTrPanel textarea,#gwTrPanel input,#gwTrPanel select{display:block;width:100%;box-sizing:border-box;margin:4px 0;padding:10px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);font:inherit}' +
      '#gwTrPanel textarea{min-height:64px;resize:vertical}#gwTrPanel .row{display:flex;gap:6px;align-items:center}#gwTrPanel .row select{flex:1}' +
      '#gwTrPanel pre{margin:6px 0;padding:8px;background:var(--key-fn-bg);color:var(--key-text);border:1px solid var(--divider);border-radius:var(--key-radius,8px);white-space:pre-wrap;word-break:break-word;min-height:2.4em}' +
      '#gwTrPanel select option{background:var(--key-fn-bg);color:var(--key-text)}';
    doc.head.appendChild(css);
    panel = doc.createElement('div'); panel.id = 'gwTrPanel'; panel.style.display = 'none';
    (doc.getElementById('kbWrap') || doc.body).appendChild(panel);

    function el(tag, text, cls, parent) { var e = doc.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; (parent || panel).appendChild(e); return e; }
    function btn(label, fn, id, parent) { var b = doc.createElement('button'); if (id) b.id = id; b.textContent = label; b.addEventListener('click', fn); (parent || panel).appendChild(b); return b; }
    function field(tag, id, ph, type, max) { var i = doc.createElement(tag); i.id = id; if (ph) i.placeholder = ph; if (type) i.type = type; if (max) i.maxLength = max; i.autocomplete = 'off'; i.spellcheck = false; panel.appendChild(i); return i; }

    var head = el('div', null, 'gw-head'), t = doc.createElement('div'); t.className = 'gw-title'; t.textContent = '🌐 Terjemah · '; var b = doc.createElement('b'); b.textContent = 'EN ID SU JV'; t.appendChild(b); head.appendChild(t);
    btn('✕ Tutup', function () { root.gwTranslateClose(); }, null, head).className = 'fn';
    el('div', 'Memuat…', 'hint').id = 'gwtr-status';

    var row = el('div', null, 'row'), from = doc.createElement('select'), to = doc.createElement('select'); from.id = 'gwtr-from'; to.id = 'gwtr-to';
    Object.keys(C.LANGS).forEach(function (c) { [from, to].forEach(function (s) { var o = doc.createElement('option'); o.value = c; o.textContent = C.LANGS[c].name; s.appendChild(o); }); });
    from.value = 'id'; to.value = 'en'; row.appendChild(from); btn('⇄', function () { var a = from.value; from.value = to.value; to.value = a; }, null, row); row.appendChild(to);

    var chips = el('div', null, 'chips'), cb = {};
    [['Otomatis', 'auto'], ['Llama offline', 'llama'], ['Kamus offline', 'dict'], ['Spark online', 'spark']].forEach(function (m) {
      cb[m[1]] = btn(m[0], function () { engine = m[1]; Object.keys(cb).forEach(function (k) { cb[k].className = ''; }); cb[m[1]].className = 'on'; refresh(); }, null, chips); });
    cb.auto.className = 'on';
    el('div', 'Otomatis = Llama offline bila siap, kalau tidak kamus offline. Online TIDAK pernah dipakai otomatis.', 'hint');

    field('textarea', 'gwtr-in', 'Ketik teks (maks ' + C.MAX_CHARS + ' karakter)', null, C.MAX_CHARS);
    btn('Terjemahkan', run, 'gwtr-go');
    btn('Ketik hasil', function () { if (last && last.ok && root.AndroidKeyboard && root.AndroidKeyboard.commitText) { try { root.AndroidKeyboard.commitText(last.text); } catch (e) {} } }, 'gwtr-type');
    var out = el('pre', 'Hasil terjemahan tampil di sini.'); out.id = 'gwtr-out';
    el('div', '', 'hint').id = 'gwtr-note';

    el('h4', 'Spark online (opsional, kunci milikmu sendiri)');
    el('div', 'Jika dinyalakan, HANYA teks di kotak di atas dikirim ke Meta Model API saat kamu menekan Terjemahkan dengan mesin "Spark online". Kunci disimpan di HP ini saja.', 'hint');
    field('input', 'gwtr-key', 'API key Meta Model API', 'password', 300);
    field('input', 'gwtr-model', 'Model (kosong = bawaan)', 'text', 60);
    btn('Simpan kunci/model', function () {
      var k = $('gwtr-key').value; if (k) { var r = NS.spark.setKey(k); if (!r.ok) { setText('gwtr-note', msg(r)); return; } $('gwtr-key').value = ''; }
      var r2 = NS.spark.setConfig({ model: $('gwtr-model').value.trim() }); setText('gwtr-note', r2.ok ? 'Tersimpan.' : msg(r2)); refresh(); });
    btn('Hapus kunci', function () { NS.spark.clearKey(); setText('gwtr-note', 'Kunci dihapus dari HP ini (cabut juga di dashboard Meta bila pernah bocor).'); refresh(); });
    btn('Nyalakan/matikan online', function () { NS.spark.enable(!NS.spark.isOn()); refresh(); }, 'gwtr-toggle');
    btn('Tes koneksi', function () { setText('gwtr-note', 'Menguji…'); NS.spark.test().then(function (r) { setText('gwtr-note', r.ok ? 'Tersambung (' + r.ms + ' ms).' : msg(r)); }); });
  }

  function refresh() {
    var parts = [], st = NS.llama ? NS.llama.status() : { available: false, text: 'modul Llama tidak dimuat' };
    parts.push('Llama offline: ' + (st.available ? 'siap ✓' : 'belum siap — ' + st.text));
    parts.push('Kamus offline: siap ✓ (' + (NS.dict ? NS.dict.size() : 0) + ' entri benih)');
    parts.push('Spark online: ' + (NS.spark.isOn() ? 'NYALA' : 'mati') + ' · kunci ' + (NS.spark.hasKey() ? NS.spark.keyHint() : 'belum ada'));
    setText('gwtr-status', parts.join('\n'));
    var cfg = NS.spark.getConfig(), m = $('gwtr-model'); if (m && !m.value && cfg.model !== NS.spark.DEFAULTS.model) m.value = cfg.model; if (m) m.placeholder = 'Model (bawaan: ' + NS.spark.DEFAULTS.model + ')';
  }

  function run() {
    var text = $('gwtr-in').value, go = $('gwtr-go'); go.disabled = true; setText('gwtr-note', 'Memproses…');
    NS.translate(text, $('gwtr-from').value, $('gwtr-to').value, { engine: engine }).then(function (r) {
      last = r; go.disabled = false;
      if (!r.ok) { setText('gwtr-out', ''); setText('gwtr-note', '✗ ' + msg(r)); return; }
      setText('gwtr-out', r.text);
      var label = r.engine === 'llama' ? 'Meta Llama (offline, di perangkat)' : r.engine === 'spark' ? 'Muse Spark (ONLINE)' : 'Kamus offline (kata-per-kata)';
      setText('gwtr-note', 'Mesin: ' + label + (r.fellBack ? ' — Llama belum siap, jadi memakai kamus' : '') + (r.note ? '\n' + r.note : ''));
    });
  }

  root.gwTranslateOpen = function () { if (!panel) build(); panel.style.display = 'block'; refresh(); };
  root.gwTranslateClose = function () { if (panel) panel.style.display = 'none'; };
})(typeof window !== 'undefined' ? window : globalThis);
