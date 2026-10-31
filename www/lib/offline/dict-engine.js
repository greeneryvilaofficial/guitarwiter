/* ============================================================================================
 * [LABEL GWTR / KAMUS-ENGINE] src/lib/offline/dict-engine.js
 * Terjemahan KATA-PER-KATA dari kamus benih (frasa terpanjang dulu, sampai 3 kata). 100% lokal, tanpa jaringan.
 * Kata yang tidak ada di kamus dibiarkan apa adanya dan dihitung (coverage) supaya hasilnya jujur.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || !NS.dictRows || NS.dict) return;
  var C = NS.core, MAX_PHRASE = 3;

  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  var index = null;   // { lang: { normalizedPhrase: row } }, dibangun malas saat pertama dipakai
  function build() {
    index = {};
    NS.dictCols.forEach(function (c) { index[c] = {}; });
    NS.dictRows.forEach(function (row) {
      NS.dictCols.forEach(function (c, i) { var k = norm(row[i]); if (!index[c][k]) index[c][k] = row; });   // baris pertama menang
    });
  }
  function colOf(lang) { return NS.dictCols.indexOf(lang); }

  function tokenize(text) { return text.match(/[\p{L}\p{N}'’-]+|\s+|[^\p{L}\p{N}\s]+/gu) || []; }
  function isWord(tok) { return /^[\p{L}\p{N}]/u.test(tok); }
  function matchCase(src, out) { return /^\p{Lu}/u.test(src) ? out.charAt(0).toUpperCase() + out.slice(1) : out; }

  function translate(text, from, to) {
    var chk = C.checkInput(text, from, to); if (!chk.ok) return chk;
    if (!index) build();
    var toks = tokenize(chk.text), out = [], words = 0, hit = 0, unknown = [], ci = colOf(to);
    for (var i = 0; i < toks.length; i++) {
      var tok = toks[i];
      if (!isWord(tok)) { out.push(tok); continue; }
      var matched = false;
      for (var n = MAX_PHRASE; n >= 1 && !matched; n--) {          // frasa terpanjang dulu
        var parts = [], j = i, got = 0;
        while (j < toks.length && got < n) { if (isWord(toks[j])) { parts.push(toks[j]); got++; } else if (!/^\s+$/.test(toks[j])) break; j++; }
        if (got !== n) continue;
        var row = index[from][norm(parts.join(' '))];
        if (row) { out.push(matchCase(tok, row[ci])); words += n; hit += n; i = j - 1; matched = true; }
      }
      if (!matched) { out.push(tok); words++; if (unknown.indexOf(tok) < 0 && unknown.length < 20) unknown.push(tok); }
    }
    var coverage = words ? hit / words : 0;
    return C.done(out.join(''), 'dict', { coverage: +coverage.toFixed(2), unknown: unknown,
      note: coverage === 1 ? 'kata-per-kata (kamus)' : 'kata-per-kata; ' + Math.round(coverage * 100) + '% kata dikenali, sisanya dibiarkan' });
  }

  NS.dict = { translate: translate, size: function () { return NS.dictRows.length; } };
})(typeof window !== 'undefined' ? window : globalThis);
