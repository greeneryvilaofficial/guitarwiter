// Menyalin src/lib -> www/lib (yang dikemas ke APK oleh Capacitor; webDir = www).
//   node scripts/sync-lib.js          salin
//   node scripts/sync-lib.js --check  hanya periksa: keluar dengan kode 1 jika www/lib tidak sama dengan src/lib
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'lib'), DST = path.join(__dirname, '..', 'www', 'lib'), check = process.argv.includes('--check');
function walk(d, base) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), path.join(base, e.name)) : [path.join(base, e.name)]); }
const files = walk(SRC, ''); let bad = 0;
for (const f of files) {
  const a = fs.readFileSync(path.join(SRC, f)), dp = path.join(DST, f);
  const same = fs.existsSync(dp) && fs.readFileSync(dp).equals(a);
  if (check) { if (!same) { bad++; console.log('BEDA/HILANG: www/lib/' + f.replace(/\\/g, '/')); } }
  else if (!same) { fs.mkdirSync(path.dirname(dp), { recursive: true }); fs.writeFileSync(dp, a); console.log('disalin: www/lib/' + f.replace(/\\/g, '/')); }
}
if (fs.existsSync(DST)) for (const f of walk(DST, '')) if (!files.includes(f)) { if (check) { bad++; console.log('KELEBIHAN: www/lib/' + f); } else { fs.unlinkSync(path.join(DST, f)); console.log('dihapus: www/lib/' + f); } }
if (check) { console.log(bad ? 'www/lib TIDAK sinkron dengan src/lib -> jalankan: npm run build:web' : 'www/lib sinkron dengan src/lib (' + files.length + ' berkas)'); process.exit(bad ? 1 : 0); }
console.log('selesai (' + files.length + ' berkas)');
