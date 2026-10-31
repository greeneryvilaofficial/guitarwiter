/* ============================================================================================
 * [LABEL GWTR / SPARK ONLINE] src/lib/online/spark.js
 * Muse Spark lewat Meta Model API (kompatibel OpenAI chat completions). SATU-SATUNYA berkas di src/lib yang memakai jaringan.
 *  - MATI secara bawaan; harus dinyalakan pengguna (enable) DAN pengguna memasukkan kunci API miliknya sendiri.
 *  - Hanya teks di kotak terjemahan yang dikirim (maks 500 karakter) — tidak pernah ketikan keyboard, audio, atau tab.
 *  - Kunci disimpan hanya di localStorage perangkat ini, dikirim hanya di header Authorization, hanya ke https://*.meta.ai.
 *  - Tanpa percobaan ulang otomatis, satu permintaan sekali jalan, jeda minimal 1 detik, batas token keluaran.
 *  - Kunci di dalam aplikasi klien bisa diekstrak: untuk rilis publik pakai proksi server milikmu sendiri.
 * ============================================================================================ */
(function (root) {
  'use strict';
  var NS = root.GWTR;
  if (!NS || !NS.core || NS.spark) return;
  var C = NS.core;
  var K_KEY = 'gw_spark_key', K_CFG = 'gw_spark_cfg', K_ON = 'gw_spark_on';
  var DEFAULTS = { endpoint: 'https://api.meta.ai/v1/chat/completions', model: 'muse-spark-1.2', maxTokens: 512, timeoutMs: 20000, reasoningEffort: 'minimal' };
  var busy = false, lastAt = 0;

  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function get(k) { try { var s = ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { try { var s = ls(); if (s) s.setItem(k, v); return true; } catch (e) { return false; } }
  function del(k) { try { var s = ls(); if (s) s.removeItem(k); } catch (e) {} }

  /* Endpoint: hanya https, host meta.ai atau subdomainnya, tanpa user:pass, query, hash, spasi. Kunci tidak boleh bocor ke host lain. */
  function checkEndpoint(u) {
    if (typeof u !== 'string' || /\s/.test(u) || u.length > 200) return false;
    var m = /^https:\/\/([a-z0-9.-]+)(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/i.exec(u);
    if (!m) return false;
    var h = m[1].toLowerCase();
    return h === 'meta.ai' || /\.meta\.ai$/.test(h);
  }
  function getConfig() {
    var c = {}; try { c = JSON.parse(get(K_CFG) || '{}') || {}; } catch (e) {}
    var cfg = { endpoint: DEFAULTS.endpoint, model: DEFAULTS.model, maxTokens: DEFAULTS.maxTokens, timeoutMs: DEFAULTS.timeoutMs, reasoningEffort: DEFAULTS.reasoningEffort };
    if (typeof c.endpoint === 'string' && checkEndpoint(c.endpoint)) cfg.endpoint = c.endpoint;
    if (typeof c.model === 'string' && /^[A-Za-z0-9._:-]{1,60}$/.test(c.model)) cfg.model = c.model;
    if (typeof c.reasoningEffort === 'string' && /^(|minimal|low|medium|high|xhigh)$/.test(c.reasoningEffort)) cfg.reasoningEffort = c.reasoningEffort;
    return cfg;
  }
  function setConfig(p) {
    var cur = getConfig(); p = p || {};
    if (p.endpoint !== undefined) { if (p.endpoint === '') cur.endpoint = DEFAULTS.endpoint; else if (checkEndpoint(p.endpoint)) cur.endpoint = p.endpoint; else return C.fail('bad-endpoint', 'harus https://…meta.ai/…, tanpa user:pass / query / spasi'); }
    if (p.model !== undefined) { if (p.model === '') cur.model = DEFAULTS.model; else if (/^[A-Za-z0-9._:-]{1,60}$/.test(p.model)) cur.model = p.model; else return C.fail('bad-model'); }
    if (p.reasoningEffort !== undefined) cur.reasoningEffort = p.reasoningEffort;
    set(K_CFG, JSON.stringify({ endpoint: cur.endpoint, model: cur.model, reasoningEffort: cur.reasoningEffort }));
    return { ok: true, config: getConfig() };
  }

  function setKey(k) { k = String(k == null ? '' : k).trim(); if (!/^[\x21-\x7E]{8,300}$/.test(k)) return C.fail('bad-key', 'kunci tidak valid (tanpa spasi, 8–300 karakter)'); return set(K_KEY, k) ? { ok: true } : C.fail('storage'); }
  function clearKey() { del(K_KEY); return { ok: true }; }
  function hasKey() { return !!get(K_KEY); }
  function keyHint() { var k = get(K_KEY); return k ? k.length + ' karakter, berakhir …' + k.slice(-4) : ''; }
  function enable(on) { if (on) set(K_ON, '1'); else del(K_ON); return { ok: true, on: isOn() }; }
  function isOn() { return get(K_ON) === '1'; }

  /* Murni (tanpa jaringan): bisa diuji. Kunci hanya ada di header Authorization, tidak pernah di URL maupun badan. */
  function buildRequest(text, from, to) {
    var cfg = getConfig(), key = get(K_KEY) || '';
    var body = { model: cfg.model, messages: [{ role: 'system', content: C.systemPrompt(from, to) }, { role: 'user', content: text }], max_completion_tokens: cfg.maxTokens, temperature: 0 };
    if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
    return { url: cfg.endpoint, init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) }, timeoutMs: cfg.timeoutMs };
  }

  function readText(j) {
    var m = j && j.choices && j.choices[0] && j.choices[0].message; if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) return m.content.map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; }).join('');
    return '';
  }
  function httpError(status, detail) {
    var e = status === 401 || status === 403 ? 'key-rejected' : status === 404 ? 'endpoint-404' : status === 400 || status === 422 ? 'bad-request' : status === 429 ? 'rate-limited' : status >= 500 ? 'server-error' : 'http-' + status;
    return C.fail(e, detail);
  }

  function call(text, from, to) {
    if (typeof root.fetch !== 'function') return Promise.resolve(C.fail('no-network-api'));
    var req = buildRequest(text, from, to), ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = null, t0 = Date.now();
    if (ctl) { req.init.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, req.timeoutMs); }
    return root.fetch(req.url, req.init).then(function (resp) {
      return resp.text().then(function (raw) {
        var j = null; try { j = JSON.parse(raw); } catch (e) {}
        if (!resp.ok) return httpError(resp.status, j && j.error && (j.error.message || j.error) );
        var out = C.cleanOutput(readText(j));
        return out ? C.done(out, 'spark', { note: 'Muse Spark (Meta Model API), online', ms: Date.now() - t0 }) : C.fail('empty-answer');
      });
    }).catch(function (e) { return C.fail(e && e.name === 'AbortError' ? 'timeout' : 'network', e && e.name === 'AbortError' ? '' : (e && e.message)); })
      .then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  function guarded(text, from, to) {
    if (!isOn()) return Promise.resolve(C.fail('online-disabled'));
    if (!hasKey()) return Promise.resolve(C.fail('no-key'));
    if (busy) return Promise.resolve(C.fail('busy'));
    if (Date.now() - lastAt < 1000) return Promise.resolve(C.fail('too-fast'));
    busy = true; lastAt = Date.now();
    return call(text, from, to).then(function (r) { busy = false; return r; });
  }
  function translate(text, from, to) { var chk = C.checkInput(text, from, to); if (!chk.ok) return Promise.resolve(chk); return guarded(chk.text, from, to); }
  function test() { return guarded('Halo', 'id', 'en'); }

  NS.spark = { DEFAULTS: DEFAULTS, getConfig: getConfig, setConfig: setConfig, setKey: setKey, clearKey: clearKey, hasKey: hasKey, keyHint: keyHint, enable: enable, isOn: isOn, buildRequest: buildRequest, checkEndpoint: checkEndpoint, translate: translate, test: test };
})(typeof window !== 'undefined' ? window : globalThis);
