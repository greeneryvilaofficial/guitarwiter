/* ============================================================================================
 * [LABEL GWTR / KAMUS] src/lib/offline/dict-data.js
 * Kamus BENIH (seed) 4 bahasa: [Indonesia, Inggris, Sunda, Jawa]. Kata/frasa umum saja, register netral.
 * Ini BUKAN kamus lengkap: dipakai kata-per-kata sebagai cadangan offline. Perluas dengan menambah baris.
 * Sunda/Jawa ditulis dari pengetahuan umum penulis kode; mohon diperiksa penutur asli sebelum rilis besar.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR = root.GWTR || {};
  NS.dictRows = [
    // sapaan & sopan santun
    ['halo', 'hello', 'halo', 'halo'],
    ['terima kasih', 'thank you', 'hatur nuhun', 'matur nuwun'],
    ['selamat pagi', 'good morning', 'wilujeng enjing', 'sugeng enjing'],
    ['selamat siang', 'good afternoon', 'wilujeng siang', 'sugeng siang'],
    ['selamat malam', 'good evening', 'wilujeng wengi', 'sugeng dalu'],
    ['maaf', 'sorry', 'punten', 'ngapunten'],
    ['silakan', 'please', 'mangga', 'mangga'],
    ['ya', 'yes', 'enya', 'iya'],
    ['tidak', 'no', 'henteu', 'ora'],
    // kata ganti & tanya
    ['saya', 'I', 'abdi', 'kula'],
    ['aku', 'me', 'abdi', 'aku'],
    ['kamu', 'you', 'anjeun', 'kowe'],
    ['anda', 'you', 'anjeun', 'panjenengan'],
    ['ini', 'this', 'ieu', 'iki'],
    ['itu', 'that', 'eta', 'kuwi'],
    ['apa', 'what', 'naon', 'apa'],
    ['siapa', 'who', 'saha', 'sapa'],
    ['di mana', 'where', 'dimana', 'ngendi'],
    ['kapan', 'when', 'iraha', 'kapan'],
    ['mengapa', 'why', 'naha', 'kenapa'],
    ['bagaimana', 'how', 'kumaha', 'piye'],
    ['dan', 'and', 'jeung', 'lan'],
    ['atau', 'or', 'atawa', 'utawa'],
    // kata kerja
    ['makan', 'eat', 'dahar', 'mangan'],
    ['minum', 'drink', 'nginum', 'ngombe'],
    ['tidur', 'sleep', 'sare', 'turu'],
    ['pergi', 'go', 'indit', 'lunga'],
    ['datang', 'come', 'datang', 'teka'],
    ['pulang', 'go home', 'mulih', 'mulih'],
    ['melihat', 'see', 'ningali', 'ndeleng'],
    ['mendengar', 'hear', 'ngadéngé', 'krungu'],
    ['main', 'play', 'maén', 'dolanan'],
    ['nyanyi', 'sing', 'nyanyi', 'nembang'],
    ['suka', 'like', 'resep', 'seneng'],
    ['cinta', 'love', 'cinta', 'tresna'],
    ['mau', 'want', 'hoyong', 'péngin'],
    ['punya', 'have', 'gaduh', 'nduwe'],
    ['tahu', 'know', 'terang', 'ngerti'],
    // benda & orang
    ['air', 'water', 'cai', 'banyu'],
    ['rumah', 'house', 'imah', 'omah'],
    ['nasi', 'rice', 'sangu', 'sega'],
    ['orang', 'person', 'jelema', 'wong'],
    ['teman', 'friend', 'babaturan', 'kanca'],
    ['ibu', 'mother', 'indung', 'ibu'],
    ['ayah', 'father', 'bapa', 'bapak'],
    ['uang', 'money', 'duit', 'dhuwit'],
    ['jalan', 'road', 'jalan', 'dalan'],
    ['sekolah', 'school', 'sakola', 'sekolah'],
    ['buku', 'book', 'buku', 'buku'],
    ['lagu', 'song', 'lagu', 'lagu'],
    ['gitar', 'guitar', 'gitar', 'gitar'],
    ['musik', 'music', 'musik', 'musik'],
    ['nada', 'note', 'nada', 'nada'],
    ['senar', 'string', 'tali', 'senar'],
    // waktu & tempat
    ['hari ini', 'today', 'poé ieu', 'dina iki'],
    ['sekarang', 'now', 'ayeuna', 'saiki'],
    ['besok', 'tomorrow', 'isukan', 'sesuk'],
    ['kemarin', 'yesterday', 'kamari', 'wingi'],
    ['pagi', 'morning', 'isuk', 'esuk'],
    ['malam', 'night', 'peuting', 'wengi'],
    ['di sini', 'here', 'di dieu', 'ing kene'],
    ['di sana', 'there', 'di ditu', 'ing kana'],
    ['sudah', 'already', 'geus', 'wis'],
    ['belum', 'not yet', 'acan', 'durung'],
    ['sangat', 'very', 'pisan', 'banget'],
    // sifat
    ['baik', 'good', 'hadé', 'apik'],
    ['besar', 'big', 'gedé', 'gedhe'],
    ['kecil', 'small', 'leutik', 'cilik'],
    ['baru', 'new', 'anyar', 'anyar'],
    ['lama', 'old', 'heubeul', 'suwé'],
    ['cepat', 'fast', 'gancang', 'cepet'],
    ['lambat', 'slow', 'laun', 'alon'],
    ['panas', 'hot', 'panas', 'panas'],
    ['dingin', 'cold', 'tiis', 'adhem'],
    ['sedih', 'sad', 'sedih', 'sedhih'],
    ['sakit', 'sick', 'gering', 'lara'],
    ['cantik', 'beautiful', 'geulis', 'ayu'],
    // angka
    ['satu', 'one', 'hiji', 'siji'],
    ['dua', 'two', 'dua', 'loro'],
    ['tiga', 'three', 'tilu', 'telu'],
    ['empat', 'four', 'opat', 'papat'],
    ['lima', 'five', 'lima', 'lima'],
    ['enam', 'six', 'genep', 'enem'],
    ['tujuh', 'seven', 'tujuh', 'pitu'],
    ['delapan', 'eight', 'dalapan', 'wolu'],
    ['sembilan', 'nine', 'salapan', 'sanga'],
    ['sepuluh', 'ten', 'sapuluh', 'sepuluh']
  ];
  NS.dictCols = ['id', 'en', 'su', 'jv'];
})(typeof window !== 'undefined' ? window : globalThis);
