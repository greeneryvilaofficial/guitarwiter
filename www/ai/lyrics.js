/* ============================================================================================
 * [LABEL LIRIK / OFFLINE] guitarwriter.com/ai/lyrics.js  (v1.5.0)
 * Penulis lirik berbahasa Indonesia tanpa jaringan: kumpulan baris asli (ditulis untuk proyek ini) dikelompokkan per rima,
 * dirangkai dengan rima AABB, bait/reff/bridge/outro. Deterministik per "benih" (seed): benih sama = lirik sama; benih lain = variasi.
 * Gaya: galau (cinta, hujan, Bandung) & ceria. Semua baris asli, bukan cuplikan lagu orang lain.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || G.lyrics) return;

  var BANK = {
    galau: {
      verse: [   // kelompok rima; tiap kelompok = baris-baris yang bersajak
        ['Dingin kota Bandung menyimpan kenangan', 'Kita pernah tertawa tanpa beban', 'Kini hanya sepi yang tinggal di jalan', 'Kopi hangat pun tak lagi menenangkan', 'Senyummu terlukis di tiap sudut jalan'],
        ['Hujan turun pelan menyebut namamu', 'Di bangku taman ini aku masih menunggu', 'Dan rindu ini tak pernah berlalu', 'Bandung berkabut seperti hatiku', 'Entah di mana kini bayangmu berlabuh'],
        ['Senja jatuh di langit Bandung kita', 'Banyak rindu yang tak sempat jadi kata', 'Dan aku masih menunggu di sana', 'Meski kau tak pernah tahu betapa aku cinta', 'Biarlah waktu yang menjawab semuanya'],
        ['Malam ini aku sendiri', 'Menyusuri jalan yang dulu kau temani', 'Di antara dingin dan sepi', 'Hanya bayangmu yang setia menemani', 'Entah kapan kau kembali'],
        ['Kuhapus air mata di pipi yang basah', 'Cinta ini tak pernah salah', 'Walau hati rasanya begitu lelah', 'Aku tetap mencintaimu tanpa gundah', 'Biar sepi jadi saksi, aku pasrah'],
        ['Langkahku pelan di jalanan yang lengang', 'Hatiku berat, namamu masih terkenang', 'Aku di sini, kau entah di mana, menghilang', 'Dalam doa namamu selalu kusebut, sayang', 'Semoga suatu hari kau pulang']
      ],
      hooks: [
        { title: 'Pulanglah, Bandung', lines: ['Pulanglah, Bandung masih menunggumu', 'Di sini hujan masih menyebut namamu', 'Kalau rindu ini bisa kau dengar', 'Kembalilah sebelum senja memudar'] },
        { title: 'Menunggu Hujan Reda', lines: ['Aku masih di sini menunggu hujan reda', 'Berharap kau datang membawa cinta', 'Meski luka ini terlanjur ada', 'Bagiku kau tetap satu-satunya'] },
        { title: 'Galau Ini Milikku', lines: ['Galau ini milikku sendiri', 'Biar kunikmati sampai pagi', 'Asal kau tahu aku tak pernah pergi', 'Dari sudut paling sunyi di hati'] }
      ],
      bridge: [['Mungkin semesta hanya sedang bercanda', 'Mempertemukan kita lalu membiarkan kita terluka'], ['Andai waktu bisa kuputar kembali', 'Akan kuucapkan yang dulu tak sempat kuberi'], ['Jika esok kau tak lagi mencari', 'Biarkan aku tersenyum meski sendiri']],
      outro: ['...dan hujan pun mengerti', 'Pulanglah, aku di sini']
    },
    ceria: {
      verse: [
        ['Pagi cerah, Bandung penuh warna', 'Kita berjalan sambil tertawa', 'Tak ada yang bisa menghentikan bahagia', 'Hari ini milik kita berdua'],
        ['Hatiku riang bernyanyi', 'Kuajak kau menari', 'Matahari pun ikut tersenyum pagi ini', 'Dunia terasa indah sekali'],
        ['Cintaku untukmu', 'Hangat seperti secangkir teh bersamamu', 'Setiap detik rasanya begitu syahdu', 'Kau yang membuatku selalu rindu'],
        ['Kita mainkan lagu kesukaan', 'Di taman kota bersama teman', 'Tak perlu alasan untuk merayakan', 'Hidup ini terlalu indah untuk dipikirkan']
      ],
      hooks: [
        { title: 'Nyanyikan Bersamaku', lines: ['Nyanyikan lagu ini bersamaku', 'Biar dunia tahu aku jatuh cinta padamu', 'Tak peduli hujan atau cerah, aku di sampingmu', 'Selamanya kita bernyanyi, kau dan aku'] },
        { title: 'Bandung Cerah', lines: ['Bandung hari ini cerah sekali', 'Kuajak kau jalan, kita menari', 'Genggam tanganku, jangan dilepaskan lagi', 'Karena bersamamu hidup begitu berarti'] }
      ],
      bridge: [['Kalau esok hujan pun tak mengapa', 'Selama kita masih bisa tertawa'], ['Satu, dua, tiga, ayo lompat bersama', 'Lepaskan semua beban di dada']],
      outro: ['Lalalala... lalalala...', 'Nyanyikan lagi, sekali lagi!']
    }
  };

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
  function take2(r, group, used) {
    var pool = group.filter(function (l) { return used.indexOf(l) < 0; }); if (pool.length < 2) pool = group.slice();
    var a = pool.splice(Math.floor(r() * pool.length), 1)[0], b = pool.splice(Math.floor(r() * pool.length), 1)[0] || a;
    used.push(a, b); return [a, b];
  }
  function stanza(r, groups, used, gUsed) {                       // 4 baris rima AABB dari dua kelompok berbeda
    var avail = groups.map(function (g, i) { return i; }).filter(function (i) { return gUsed.indexOf(i) < 0; }); if (avail.length < 2) { avail = groups.map(function (g, i) { return i; }); gUsed.length = 0; }
    var i1 = avail.splice(Math.floor(r() * avail.length), 1)[0], i2 = avail.splice(Math.floor(r() * avail.length), 1)[0]; gUsed.push(i1, i2);
    return take2(r, groups[i1], used).concat(take2(r, groups[i2], used));
  }

  /** mood: 'galau'|'ceria'; seed: bilangan bulat; versesCount: jumlah bait berbeda (bawaan 3). -> {title, mood, hook, sections:{verse:[[4 baris]...], chorus:[4], bridge:[2], outro:[]}} */
  function generate(mood, seed, versesCount) {
    var B = BANK[mood] || BANK.galau, r = rng(seed | 0), used = [], gUsed = [], n = versesCount || 3, verses = [], i;
    for (i = 0; i < n; i++) verses.push(stanza(r, B.verse, used, gUsed));
    var hook = pick(r, B.hooks), bridge = pick(r, B.bridge);
    return { title: hook.title, mood: BANK[mood] ? mood : 'galau', verses: verses, chorus: hook.lines.slice(), bridge: bridge.slice(), outro: B.outro.slice() };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  G.lyrics = { generate: generate, hash: hash, _BANK: BANK };
})(typeof window !== 'undefined' ? window : globalThis);
