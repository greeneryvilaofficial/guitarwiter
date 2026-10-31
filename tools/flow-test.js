// Uji perilaku www/index.html di jsdom.  Pakai: npm i jsdom@22 && node tools/flow-test.js [path/index.html]
const fs=require('fs'); const {JSDOM,VirtualConsole}=require('jsdom');
const src=process.argv[2]||require('path').join(__dirname,'..','www','index.html');
let html=fs.readFileSync(src,'utf8');
const hook=`window.__t={ get allKeys(){return allKeys}, get NOTES(){return NOTES}, directNoteChar, autoTypeNote, setMode, shiftToggle, updateShiftVisual,
 get mode(){return mode}, get shiftActive(){return shiftActive}, set shiftActive(v){shiftActive=v}, get capsLock(){return capsLock}, set capsLock(v){capsLock=v},
 get symPage(){return symPage}, set symPage(v){symPage=v}, KEY_DEFS, NOTE_COUNT, get text(){return text}, set text(v){text=v}, get cursorPos(){return cursorPos}, set cursorPos(v){cursorPos=v}, applySymbolMode, updateShiftLabel, get autoShift(){return autoShift} };`;
const marker='  startMic();\n})();\n</script>';
if(!html.includes(marker)) throw new Error('marker');
html=html.replace(marker, hook+'  try{startMic();}catch(e){}\n})();\n</script>');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(String(e.message).slice(0,140)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',virtualConsole:vc,
 beforeParse(w){ w.matchMedia=w.matchMedia||(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})); w.HTMLElement.prototype.scrollIntoView=function(){}; w.navigator.vibrate=()=>true;
  w.AudioContext=function(){return {createGain(){return {gain:{value:0},connect(){}}},createOscillator(){return {connect(){},start(){},stop(){},frequency:{}}},destination:{},currentTime:0,resume(){},state:'running'}}; }});
const w=dom.window; let fails=0, passes=0;
function check(name,cond,extra){ if(cond){passes++;} else {fails++; console.log('  GAGAL:',name,extra||'');} }
setTimeout(()=>{
 const T=w.__t; if(!T){console.log('NO HOOK',errs);process.exit(1);}
 const clear=()=>{T.text='';T.cursorPos=0;};
 // ---- 1. audit label/tag/direct di semua mode
 function audit(label){
   let bad=0;
   for(let i=0;i<T.NOTE_COUNT;i++){ const el=T.allKeys[i]; const ch=(el.querySelector('.ch').textContent||'').trim(); const tag=el.querySelector('.tag').textContent;
     if(tag!==T.NOTES[i].name){bad++;console.log('   tag salah',label,i,tag,T.NOTES[i].name);}
     if(el.dataset.type==='note'){ const d=T.directNoteChar(i); const hidden=(T.mode==='letters'&&i<10);
       if(!hidden && d!==null && d!==ch){bad++;console.log('   label!=direct',label,i,tag,JSON.stringify(ch),JSON.stringify(d));} } }
   check('audit '+label, bad===0);
 }
 audit('letters'); T.shiftActive=true; T.updateShiftVisual(); audit('shift'); T.capsLock=true; T.updateShiftVisual(); audit('caps'); T.capsLock=false;T.shiftActive=false;T.updateShiftVisual();
 T.setMode('symbols'); audit('sym1'); T.symPage=2; T.applySymbolMode(true); T.updateShiftLabel(); audit('sym2'); T.symPage=1; T.setMode('letters');
 // ---- 2. ketik setiap huruf lewat jalur "Java sudah ngetik" (onNativePitchCommitted) -> teks harus tepat satu huruf
 T.setMode('letters'); let cnt=0;
 for(const i of [10,11,12,20,21,30,31,36]){ clear(); const ch=T.directNoteChar(i); w.onNativePitchCommitted(i, T.NOTES[i].freq, ch, 40);
   // Java yang mengetik; JS hanya sinkron -> teks lokal JS tidak boleh menambah huruf lagi (suppress) 
   check('commit idx'+i+' tidak menggandakan', T.text.length<=1, JSON.stringify(T.text)); cnt++; }
 // ---- 3. Shift lewat NADA: dua deteksi A4 berdekatan tidak boleh mengunci CapsLock
 T.shiftActive=false; T.capsLock=false; T.updateShiftVisual();
 w.onNativePitchIndex(29, 440); w.onNativePitchIndex(29, 440);   // dua deteksi < 350 ms
 check('2x A4 cepat TIDAK jadi CapsLock', T.capsLock===false, 'caps='+T.capsLock);
 check('2x A4 -> shift kembali mati', T.shiftActive===false, 'shift='+T.shiftActive);
 w.onNativePitchIndex(29, 440); check('1x A4 -> shift satu-kali aktif', T.shiftActive===true && T.capsLock===false);
 // huruf berikutnya jadi kapital lalu shift habis
 clear(); const q=T.directNoteChar(10); check('direct q saat shift = Q', q==='Q', q); w.onNativePitchCommitted(10,146.8,q,40); check('shift habis sesudah 1 huruf', T.shiftActive===false, 'shift='+T.shiftActive);
 // ---- 4. CapsLock lewat SENTUHAN tetap bisa (ketuk dua kali)
 const shiftEl=T.allKeys[29]; T.shiftActive=false; T.capsLock=false; T.updateShiftVisual();
 T.shiftToggle(shiftEl); T.shiftToggle(shiftEl); check('ketuk 2x sentuh -> CapsLock', T.capsLock===true);
 T.shiftToggle(shiftEl); check('ketuk lagi -> CapsLock mati', T.capsLock===false && T.shiftActive===false);
 // ---- 5. F#5 (?123) lewat nada: ke simbol, lalu kembali
 T.setMode('letters'); w.onNativePitchIndex(38, 740); check('F#5 -> mode simbol', T.mode==='symbols', T.mode);
 w.onNativePitchIndex(38, 740); check('F#5 lagi -> mode huruf', T.mode==='letters', T.mode);
 // ---- 6. di mode simbol, nada q-p mengetik simbol yang tertulis
 T.setMode('symbols'); clear(); const s0=T.directNoteChar(10); check('simbol idx10 = @', s0==='@', s0);
 T.setMode('letters');
 // ---- 7. tidak ada kejadian error JS
 check('tanpa error JS', errs.length===0, errs.join(' | '));
 console.log(`HASIL: ${passes} lulus, ${fails} gagal`, errs.length?('errs:'+errs.slice(0,3)):'' );
 process.exit(fails?1:0);
},500);
