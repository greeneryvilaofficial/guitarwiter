/* ============================================================================================
 * [LABEL MUSE WONDER] guitarwriter.com/ai/generate-full.js  (v1.4.0)
 * Humming 30 detik -> Wonder "berpikir" -> tab lagu penuh (~3 menit).
 *
 * Alur:  startHum() -> (pengguna bersenandung 30 dtk, hitung mundur) -> getHum() -> generateFull(hum)
 *        -> (opsional polling job) -> validasi tab -> GWAI.tab.set()  -> event 'gw:wonder-*'.
 * Audio berasal dari mic NATIVE (NativeMicPitchDetector -> HumRecorder) lewat AndroidKeyboard.*,
 * BUKAN getUserMedia (mic sudah dipakai native; dua pemakai sekaligus saling mengunci di Android).
 *
 * Kontrak ADAPTOR (bukan spesifikasi resmi vendor; sesuaikan lewat GWAI.hooks.wonder):
 *   POST {baseUrl}{path||''}  body: { audio:'<WAV base64>', format:'wav', sample_rate, expand_to:<detik>, schema:'gw-tab-v1' }
 *   respons langsung: { tab:{...} }          -> selesai
 *   respons job:      { job_id:'..' }        -> poll GET {path}/{job_id} sampai { status:'done', tab:{...} }
 *                                              ('failed'/'error' -> gagal)
 * ============================================================================================ */
(function (root) {
  'use strict';
  var G = root.GWAI; if (!G || G.wonder) return;

  var HUM_SECONDS = 30, TARGET_SECONDS = 180;
  var POLL_MS = 3000, POLL_MAX_MS = 5 * 60 * 1000;           // tunggu maksimum 5 menit
  var busy = false, timer = null;

  function native() { try { return root.AndroidKeyboard || null; } catch (e) { return null; } }

  /** Mulai rekam 30 dtk terakhir. onTick(sisaDetik) tiap detik; onReady() saat 30 dtk penuh. Mengembalikan {ok}|{ok:false,error}. */
  function startHum(onTick, onReady) {
    var a = native();
    if (!a || !a.startHumCapture) return { ok: false, error: 'no-native-mic' };
    if (!a.startHumCapture()) return { ok: false, error: 'mic-not-running' };      // mic native belum menyala / tanpa izin
    var left = HUM_SECONDS; G.emit('gw:hum-start', { seconds: left });
    cancelHum(true);
    timer = setInterval(function () {
      left--; if (onTick) { try { onTick(left); } catch (e) {} }
      if (left <= 0) { cancelHum(true); G.emit('gw:hum-ready', {}); if (onReady) { try { onReady(); } catch (e) {} } }
    }, 1000);
    return { ok: true };
  }
  function cancelHum(keepRecording) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!keepRecording) { var a = native(); try { a && a.stopHumCapture && a.stopHumCapture(); } catch (e) {} }
  }

  /** Ambil rekaman (WAV base64). {ok,data:{audio,seconds}} */
  function getHum() {
    var a = native(), b64 = '';
    try { if (a && a.getLast30SecAudio) b64 = a.getLast30SecAudio() || ''; } catch (e) {}
    if (!b64) return { ok: false, error: 'no-audio' };
    var sec = 0; try { sec = a.humSeconds ? a.humSeconds() : 0; } catch (e) {}
    try { a.stopHumCapture && a.stopHumCapture(); } catch (e) {}
    return { ok: true, data: { audio: b64, seconds: sec } };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function pollJob(id, started, onProgress) {
    if (Date.now() - started > POLL_MAX_MS) return Promise.resolve({ ok: false, error: 'timeout' });
    var cfg = G.getConfig().services.wonder, base = (cfg.path || '').replace(/\/+$/, '');
    return G.call('wonder', null, { method: 'GET', path: base + '/' + encodeURIComponent(id) }).then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {}, st = String(d.status || '').toLowerCase();
      if (onProgress) { try { onProgress(typeof d.progress === 'number' ? d.progress : null, st); } catch (e) {} }
      if (st === 'failed' || st === 'error') return { ok: false, error: 'job-failed' };
      if (st === 'done' || d.tab) return { ok: true, data: d };
      return sleep(POLL_MS).then(function () { return pollJob(id, started, onProgress); });
    });
  }

  /** hum = {audio:<base64>, seconds}. opts: {expandTo:detik, onProgress(p,status)}. */
  function generateFull(hum, opts) {
    opts = opts || {};
    if (!G.enabled('wonder')) return Promise.resolve({ ok: false, error: 'not-configured' });
    if (!hum || !hum.audio) return Promise.resolve({ ok: false, error: 'no-audio' });
    if (busy) return Promise.resolve({ ok: false, error: 'busy' });
    busy = true; G.emit('gw:wonder-start', {});
    var cfg = G.getConfig().services.wonder;
    var body = { model: cfg.model || undefined, audio: hum.audio, format: 'wav', sample_rate: 16000,
                 expand_to: opts.expandTo || TARGET_SECONDS, schema: 'gw-tab-v1' };
    return G.call('wonder', body, { timeoutMs: 120000 }).then(function (r) {
      if (!r.ok) return r;
      var d = r.data || {};
      if (d.tab == null && d.job_id) return pollJob(d.job_id, Date.now(), opts.onProgress);
      return r;
    }).then(function (r) {
      if (!r.ok) return r;
      var v = G.tab.validate((r.data || {}).tab);
      if (!v.ok) return v;                                   // jawaban rusak -> tab aktif TIDAK diubah
      var s = G.tab.set(v.data, 'wonder');
      return s.ok ? { ok: true, data: s.data, dropped: v.dropped, seconds: G.tab.seconds(s.data) } : s;
    }).then(function (res) { busy = false; G.emit('gw:wonder-end', res); return res; },
            function () { busy = false; return { ok: false, error: 'unexpected' }; });
  }

  G.wonder = { startHum: startHum, cancelHum: function () { cancelHum(false); }, getHum: getHum, generateFull: generateFull, isBusy: function () { return busy; } };
})(typeof window !== 'undefined' ? window : globalThis);
