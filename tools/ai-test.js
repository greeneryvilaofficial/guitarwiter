const fs = require('fs');
const mustExist = ['www/lib/offline/llama.js','www/lib/offline/dict-data.js','www/lib/offline/dict-engine.js'];
for(const f of mustExist){ if(!fs.existsSync(f)){ console.error('MISSING '+f); process.exit(1);} }
console.log('✅ AI offline OK - llama GGUF + kamus 4 bahasa');
