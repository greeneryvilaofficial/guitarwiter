const fs = require('fs');
const mustExist = ['www/lib/online/spark.js','www/lib/ui/translate-panel.js'];
for(const f of mustExist){ if(!fs.existsSync(f)){ console.error('MISSING '+f); process.exit(1);} }
console.log('✅ panel OK - Muse Spark online + UI');
