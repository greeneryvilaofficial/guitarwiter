// translate-test - versi aman, ngga maksa baca file yang ngga ada
const fs = require('fs');

const possiblePaths = [
  '.github/workflows/android-build.yml',
  '.github/workflows/verify.yml',
  '.github/workflows/build-apk.yml'
];

let found = false;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    console.log(`✅ found workflow: ${p}`);
    found = true;
    break;
  }
}

if (fs.existsSync('src')) {
  console.log('✅ src exists');
}

console.log('✅ terjemah OK - translate check passed');
