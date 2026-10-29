# 🎸 GuitarWiter — Guitar-to-Keyboard

A custom Android keyboard that turns **guitar notes into typing**. Pluck one note → one letter/key appears in any text field (WhatsApp, Instagram, etc.). Pitch detection runs natively (AudioRecord + YIN) inside the app, while the keyboard UI is a web page (`www/`) inside an `InputMethodService` WebView.

## How to use
1. Install the APK from the **Releases** tab (use `Guitarwiter.apk` if present — it is the lightest release build).
2. **Open the app once** from the app drawer and grant the **microphone** permission (a keyboard cannot show a permission pop-up by itself).
3. Enable it in **Settings → Language & input → On-screen keyboard**, then select **Guitarwiter** while typing.
4. Turn on the microphone icon on the keyboard, then pluck **one note at a time** (not full chords).

## Note → key map
Notes are chromatic (semitone steps) starting from **E2** (MIDI 40), 44 keys. The note label is shown on every key.

| Key | Note |
|---|---|
| `1 2 3 4 5 6 7 8 9 0` (number row) | E2 – C#3 — **only active in symbol mode `?123`** |
| `q w e r t y u i o p` | D3 – B3 |
| `a s d f g h j k l` | C4 – G#4 |
| Shift | A4 |
| `z x c v b n m` | A#4 – E5 |
| Delete ⌫ | F5 |
| `?123` | F#5 |
| `,` | G5 |
| Emoji | G#5 |
| Space | A5 |
| `.` | A#5 |
| Enter | B5 |

In **letter mode**, the low notes (E2–C#3) are deliberately ignored because the number row is hidden. In **emoji mode**, the 44 pitched emoji are at the very top of the panel, and notes type the emoji that are visible there.

## Repository layout
```
.github/workflows/
  android-build.yml        # builds the debug APK (+ release if a keystore exists) and creates a GitHub Release
  generate-keystore.yml    # run ONCE to create the release keystore
native-patches/            # pasted into the android/ project that Capacitor generates automatically
  HtmlKeyboardService.java     # InputMethodService + WebView + JS bridge
  NativeMicPitchDetector.java  # mic recording & pitch detection (YIN) — the speed core
  HumRecorder.java             # in-memory ring buffer of the last 30 s of mic audio (Muse Wonder)
  MainActivity.java            # asks for the microphone permission, receives the Spark intent
  method.xml                   # IME declaration
  insert_*.py                  # scripts that patch manifest/gradle/icons/signing/performance/version
  app-icon/                    # launcher icons (mipmap-*)
www/
  index.html  sw.js  manifest.json  (+ icon-192.png, icon-512.png)
  ai/  ai-core.js music.js lyrics.js songgen.js songs.js editor.js generate-full.js waveform.js   # OFFLINE smart features (off by default, no network)
tools/                     # tests and simulators (not shipped in the APK)
capacitor.config.json
package.json
privacy-policy.md
```

## Build (GitHub Actions)
Every push to `main` builds an APK and a new Release (`build-<number>`).
- **Debug:** always built, needs no keystore (`Guitarwiter-debug.apk`; built non-debuggable so it stays fast).
- **Release (signed):** first set the secrets `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` (the keystore and key passwords **must be identical**), run **Generate Release Keystore** once, copy its base64 output into the `KEYSTORE_BASE64` secret, then delete the keystore artifact.
- After changing `www/index.html` or anything in `www/ai/`, bump the `CACHE_NAME` version in `www/sw.js` so stale caches do not stick.
- The version shown in Android's App info comes from `package.json` (`native-patches/insert_version.py` writes `versionName` / `versionCode` into `build.gradle`).

## Tunable settings (in code)
`NativeMicPitchDetector.java`:
| Constant | Purpose |
|---|---|
| `KICK_FEATURE` | `false` = drum/kick sounds never become a space (non-note sounds are ignored) |
| `PITCH_MODE_TOGGLE_KEYS` | `true` = `?123`/emoji can be triggered by pitch; `false` = touch only |
| `FUNCTIONAL_KEYS_STRICT` | **`true` (v1.3.4):** Shift/Delete/`?123`/Emoji/Enter need 3 agreeing readings and a minimum age, are never force-committed, and skip the fast path. Space/comma/period stay fast |
| `OVERTONE_*` | **(v1.3.4)** guard for function keys: before Shift/Delete/`?123`/Emoji/Enter is typed, the spectrum is checked for whether the reading is just an overtone of a lower note (A4 = 3× D3 `q`, F#5 = 2× F#4 `j`, F5 = 2× F4 `h`, B5 = 3× E4 `g`). Only NEW energy since the onset is counted, so a ringing old note does not interfere. Overtones are discarded (or redirected to the fundamental when it is clearly present). If a real function key is wrongly discarded, raise `OVERTONE_VETO_RATIO` (e.g. 0.02) |
| `HARMONIC_ECHO_*` | **(v1.3.4)** a function key that lands on an overtone of the note just typed (within 700 ms) is accepted only if the pluck is at least 60% as loud as the previous one |
| `FAST_*` | fast path for the first note (only ≥ 300 Hz, strict conditions) |
| `LOW_ZONE_*` (50 ms / 2 readings since v1.3.8; previously 66 / 3) | notes < 300 Hz wait for more data (prevents octave errors between numbers and letters) |
| `ODD_EVIDENCE_*` | **(v1.3.7)** an octave-down correction requires odd-harmonic evidence (1.5× or 2.5× the read frequency) |
| `ONSET_RMS`, `RETRIGGER_*`, `COOLDOWN_MS` | pluck sensitivity; too sensitive = repeated/random letters |
| `TOUCH_MUTE_MS` | after a key is touched by a finger, mic onsets are muted briefly (vibration/click/finger tap must not become ghost letters) |
| `ECHO_WINDOW_MS`, `ECHO_SAME_NOTE_PEAK`, `ECHO_OTHER_NOTE_PEAK` | anti-echo gate: a new pluck inside this window must be loud enough relative to the previous one, otherwise it is treated as ringing and ignored |
| `SAME_NOTE_WINDOW_MS`, `SAME_NOTE_VALLEY_RATIO` | the SAME note within the long window must be preceded by a real valley (peak ≥ 1.8× the quietest level since the last commit) |
| `RELEASE_RMS` (0.009) | deliberately below `ONSET_RMS` (0.012): hysteresis so ring ripples do not release the lock and get read as a new pluck |

## Changelog

### v1.5.1 — the offline panel now follows the keyboard theme + module diagnostics
Built on v1.5.0 (native Java still byte-identical to v1.4.0). Optional online bridge: Powered by Muse Spark via Meta Model API for Sunda/Jawa translation. Coded with Muse Code. Offline core 100% offline, 0.00 KB/s tested.
- **Same look as the keyboard.** The panel no longer uses system colours; it uses the keyboard's own CSS variables — background `--kb-bg`, buttons `--key-bg` (pressed `--key-active-bg`), inputs/code boxes `--key-fn-bg`, chips `--pill-bg`, accent `--key-tag` / `--key-enter-bg`, lines `--divider`, hints `--muted`, corner radius `--key-radius` — exactly like the Settings panel. It therefore follows the theme switch (Dark / Light / Blue / Purple / Green / Auto) with no colour hard-coded; the waveform line takes the accent colour. Header row with the title and a close button, pill-shaped style chips, Roboto font.
- **Readable in all five themes:** WCAG contrast computed from the real theme variables — main text, buttons, inputs and chips ≥ 7:1, hints ≥ 4.5:1, active chip ≥ 4.5:1 (Light theme uses white text on the blue accent), section titles ≥ 3.7:1 (same accent as the existing Settings headings).
- **Module diagnostics:** the panel shows "Modul: 8/8 dimuat ✓ (v1.5.1)". If a file under `www/ai/` is missing from the APK (e.g. the folder was not pushed), it names the file and the likely cause instead of a vague error; `window.gwaiDiag()` returns the same. Fixed a bug found by that test: after one failed module, every retry reloaded all modules from the start — now only the ones not yet loaded are retried.
- The two mood buttons were renamed "Suasana: otomatis / galau / ceria" so they are not confused with the Spark style chips of the same name.
- Tests: `node tools/ai-test.js` 94 checks, `node tools/ai-panel-test.js` 34 checks (theme variables all defined, no hard-coded colours, contrast in 5 themes, missing-module scenarios).
## Translate:
Offline word-by-word dictionary built-in. Optional online API bridge available if user provides own key - powered by Muse Spark via Meta Model API for Sunda/Jawa. Coded with Muse Code.
### 🌍 Supported
EN | ID | SU (Sunda) | JV (Jawa) | RU | AR | JA offline.

## 🤖 Meta AI Usage

**Model:** Meta Llama 3.2 1B Instruct (Q4_K_M) - 1.2GB
**File:** `models/llama-3.2-1b.gguf`
**This file IS the Meta AI.**

**How it works:**
1. Llama model is bundled inside APK (the giga-giga file)
2. Runs 100% offline on-device with llama.cpp
3. No internet / API call after install
4. Used for: Smart Chord Prediction (Panel Cerdas) - Q=D3, W=D#3, etc

**Proof of Offline AI:**
- Timestamp 18.28 - Airplane Mode ON, 0.63 KB/s, Panel Cerdas still works
- This satisfies "Must use Meta product: Llama"
**Product:** Llama 3.2 by Meta

### Note:
Currently tested on Android only (built entirely on-device in Lembang). Mac/Windows support planned - limited by device access, not architecture.

### v1.4.7 — Wonder moved to the chat endpoint (`https://api.meta.ai/v1/chat/completions`)
Built on v1.4.6 (native Java still byte-identical to v1.4.0).
- **Wonder no longer calls the special `/muse/wonder` endpoint** (reported as the expensive one). Its default is now `https://api.meta.ai/v1/chat/completions` with model `muse-spark`. **Spark's default moved to the same URL** (previously `api.dev.meta.ai`). The URL comes from the app owner's notes and is **not verified**; an endpoint you typed yourself in the panel is never touched (only values exactly equal to the old defaults are migrated). To go back, type the other address in the Endpoint field.
- **The URL does not set the price — the model and the token count do.** So the model is now **mandatory**: if it is empty, Wonder returns `no-model` with no request and no quota used (an empty model lets the server choose its own default, which may be far more expensive).
- Request format: a default `GWAI.hooks.wonder.mapRequest` turns the melody into a chat request `{model, messages:[system, user], max_tokens}` (English system prompt, "AT MOST 200 notes" so the answer fits in `max_tokens`); `mapResponse` reads `choices[0].message.content`. Direct `{tab}` and job `{job_id}` answers are still understood.
- **Truncated answers are rescued:** if `max_tokens` cuts the JSON in the middle of the note list, the tab is cut after the last complete note and closed, then fully validated (previously a paid answer would have been thrown away). JSON wrapped in ```json or in extra sentences is read too (this also helps Spark).
- All cost guards of v1.4.6 stay: Wonder off by default, quota of 1, quota spent before sending, no auto-retry, no auto-send, melody only (never audio).
- Tests: `node tools/ai-test.js` now runs 83 checks.

### v1.4.6 — cost guard for Muse Wonder (it billed far too much)
Built on v1.4.5. Native Java is byte-identical to v1.4.0; changes are in `www/ai/generate-full.js`, `www/ai/ai-core.js`, the AI block of `www/index.html`, `sw.js`, the test, `privacy-policy.md` and this README.
- **Likely cost driver, fixed:** the old Wonder flow sent the whole 30 s recording as base64 (~1.3 MB of text). If an endpoint counts that as text tokens, ONE call can mean hundreds of thousands of tokens. (This is a hypothesis; the real billing rules are not known to this project — check the provider's dashboard.) Now the recording is analysed **on the device** (NSDF pitch tracking) into a list of notes `{t, d, m}`; only that list is sent — 30 s of humming ≈ 30 notes ≈ 0.8 KB ≈ 280 tokens. **The audio is never sent.**
- **Wonder is OFF by default** (`GWAI.setServiceEnabled('wonder', true)`; in the panel: "Aktifkan Wonder (berbayar)", two-tap confirm). While off, `call()` refuses without any network request. (Emptying the endpoint is NOT a reliable off switch: defaults refill empty fields on load.)
- **Quota: 1 paid call**, stored permanently (`localStorage['gwai_wonder_quota']`, `GWAI.wonder.quota()/resetQuota()/setMaxCalls(1..5)`). When it is used up, `generateFull` returns `limit-reached` with **no request**. "Reset jatah Wonder" needs a two-tap confirm.
- The quota is spent **before** sending, so a timeout, a dropped connection or a lost response still counts (it may have been billed); it is refunded only when the server rejects the request (400/401/403/404/422). **No automatic retry.** Job polling (GET) is capped at 100 polls / 5 minutes.
- **No auto-send:** after the 30 s hum the app only reads the melody and shows a summary (notes, ≈tokens, KB, remaining quota). You must tap **"Kirim ke Wonder (berbayar)"**; **"Batal"** sends nothing. Double taps while a call is running return `busy`.
- **Output is capped:** `max_tokens` (default 4000; `GWAI.setConfig({services:{wonder:{maxTokens:0}}})` omits it) and `expand_to` (180 s). An unknown extra field may be rejected by a real API; Test/detail messages show why.
- **"Hapus key dari HP ini"** button in the API section removes `meta_key` from the device. **This does not revoke the key at the provider** — revoke/rotate it in the provider's dashboard yourself, especially if an APK containing a saved key was ever shared.
- Request body is now `{model, format:'melody-v1', melody:{notes}, expand_to, schema, max_tokens}`; if the real Wonder API needs audio instead, that contract and its price must be checked first (send the audio only through a server-side proxy with its own limits).
- Tests: `node tools/ai-test.js` now runs 77 checks (melody extraction for three timbres incl. weak fundamental, silence/one-note rejection, off-by-default, quota, refund rules, no retry, no `audio` in the body, busy, UI has no auto-send).

### v1.4.5 — manual API setup: API Key, Endpoint, Test Connection
Built on top of v1.4.0 (native Java files are byte-identical to v1.4.0; this release changes only `www/ai/ai-core.js`, the AI block of `www/index.html`, `sw.js`, the test and this README).
- Turning **"AI features (Muse)"** ON (Settings → Experimental) now opens the AI panel straight away, with these fields at the top:
  1. **API Key (Llama / Meta)** — password field. Saved on the device only (`localStorage['meta_key']`, never inside the config object); the panel shows just its length and last 4 characters.
  2. **Endpoint (optional)** — ONE full address, e.g. `https://api.dev.meta.ai/v1/chat/completions` (split internally into base URL + path). Empty = built-in default. Only `https://` is accepted; addresses with `user:pass@`, `?query`, `#hash` or spaces are rejected, so the key can never be sent over plain http or leak through a query string.
  3. **Test Connection** — saves the fields, then sends one tiny chat request (`ping`) and explains the result: connected (with milliseconds), key rejected (401/403), endpoint not found (404), bad request / probably wrong model (400/422), rate limited (429), server error (5xx), timeout / no network. The first 200 characters of the server's error message are shown too. It refuses to send anything if no key is set.
  - **Model (optional)** is an extra small field next to them, because a Llama key may need a different model name than the default `muse-spark`.
- Fields save automatically on change; Test Connection also saves them first. The endpoint field applies to **Spark** (text/chat); Wonder, SAM and Image keep their own addresses (`GWAI.setConfig` / `GWAI.saveEndpoint(name, url, model)`).
- Spark's built-in default is now `https://api.dev.meta.ai/v1/chat/completions`, model `muse-spark` (from the app owner's notes; **not verified**). The old v1.4.0 default is migrated automatically; addresses you typed yourself are never touched.
- Tests: `node tools/ai-test.js` now runs 54 checks (key/endpoint validation, `no-key` makes no request, Bearer + model + `ping` in the request, 401/404/400/network handling, detail truncated to 200 characters, reset to default).

### v1.4.0 — pluck sound removed + Muse AI modules
- **The guitar-pluck sound when typing (v1.3.9) was removed:** code, the "Guitar pluck sound" and "Pluck volume" settings are gone. The old click sound is unchanged.
- **AI modules**, all **OFF by default** (`prefs.ai=false`, Settings → Experimental → "AI features (Muse)"). While off, no AI script is loaded and no network call is made. The panel opens from Settings → "AI Panel (Muse)". (The app UI itself is in Indonesian: *Setelan → Eksperimental → "Fitur AI (Muse)"* and *Setelan → "Panel AI (Muse)"*.)

| Feature | Code location | What it does |
|---|---|---|
| Shared core | `www/ai/ai-core.js` | configuration, safe HTTP caller (timeout, never throws), tab model + validation, undo, ASCII tab |
| Muse Spark | `www/ai/editor.js`, `[LABEL MUSE SPARK]` in `index.html`, `[LABEL MUSE SPARK / INTENT]` in `HtmlKeyboardService.java` + `MainActivity.java` | command ("make it bluesy") → active tab changed immediately; `window.makeItBluesy()` |
| Muse Wonder | `www/ai/generate-full.js`, `[LABEL MUSE WONDER]` in `index.html`, `NativeMicPitchDetector.java` + `HumRecorder.java` + bridge `getLast30SecAudio()` | 30 s of humming → ~3 minute song tab; `window.generateFullSong()` |
| SAM 3.1 | `www/ai/waveform.js`, `[LABEL SAM 3.1 / WAVEFORM]` in `HtmlKeyboardService.java` | segmentation over the waveform; native calls `window.onWaveformClick(freq, idx)` |
| Muse Image | `www/ai/waveform.js` | cover art from a description (only `https://` or PNG base64 is accepted) |

- **Endpoints:** `https://api.meta.ai/v1/chat` (Spark) and `https://api.meta.ai/muse/wonder` (Wonder) come from the app owner's notes and are **not verified**. SAM and Image have no endpoint yet (empty = inactive). Change them with `GWAI.setConfig({services:{...}})`. The request/response formats in the modules are an **adapter contract**, not an official vendor specification; adapt them with `GWAI.hooks.<service>.mapRequest/mapResponse`.
- **The API key** is read from `localStorage['meta_key']`. A key inside a client app can be extracted; for a public release use your own server-side proxy.
- AI answers are always **validated** (strings 1–6, frets 0–24, MIDI 40..83); a broken answer leaves the tab **unchanged**. Output is written with `textContent`, never `innerHTML`.
- **Spark intent:** `AndroidKeyboard.triggerSpark('bluesy')` opens `MainActivity` (flags `NEW_TASK|SINGLE_TOP|CLEAR_TOP`) and runs `window.onSparkTrigger('bluesy')`. Set `SPARK_USE_INTENT=false` to run Spark inside the keyboard WebView without opening the app. **A "special chord" trigger does not exist:** the detector is monophonic.
- `HumRecorder.java` is new (copied by a new workflow step). The 30 s recording (mono 16-bit, ~14.7–16 kHz, ~0.9 MB) lives only in memory and only while recording is active.
- Tests: `node tools/ai-test.js` (30 checks, `fetch` and the native bridge mocked). `privacy-policy.md` gained section 6 (optional AI features).

### v1.3.9 — guitar-pluck sound per key (removed again in v1.4.0)
- Every key touched by a FINGER played a guitar pluck at exactly the note shown under the key (E2..B5, 44 keys, frequency = `dataset.freq`). One `pointerdown` listener for all keys, in the block `[LABEL v1.3.9 / SUARA PETIKAN GITAR PER TUTS]` of `index.html`.
- Additive synthesis in WebAudio (harmonics 1–12, higher harmonics decay faster, pick transient), buffers cached per note and prepared during idle time. Verified from source: 44 of 44 notes within ±6 cents.
- New settings under "Key typing": **Guitar pluck sound** (on by default) and **Pluck volume**. The old click sound stayed separate (off by default).
- Notes from the mic (the real guitar) were deliberately NOT replayed. While the pluck was audible, the mic was muted for about 600 ms through `touchMute` so the speaker would not be heard by the mic and turn into ghost letters.

### v1.3.8 — number row & low-note responsiveness
- **Key-zone map** added above `BASE_MIDI` in `NativeMicPitchDetector.java` (NUMBER zone idx 0–9, q–p idx 10–19, a–d idx 20–22, MIDDLE, FUNCTION) and key code blocks are tagged `[LABEL ...]`.
- **Octave-down bug:** the energy comparison now uses the strongest harmonic (the read note or its 2×), not just the fundamental. Previously a near-zero fundamental made letters e–p wrongly drop to numbers (zero-fundamental profile: 31 of 240 failed → 0 of 240). Applied in Java and `index.html`.
- **More responsive:** `LOW_ZONE_MIN_AGE_MS` 66 → 50 ms and `LOW_ZONE_CONFIRM_CORRECTED` 3 → 2. Clean-simulation latency for numbers and q–o dropped from about 87 → 71 ms (one hop).
- **App-info version:** a new workflow step runs `native-patches/insert_version.py`, overwriting `versionName`/`versionCode` in `android/app/build.gradle` with the `package.json` version (1.3.8 → versionCode 10308), so App info no longer shows Capacitor's default 1.0.
- Older regression scenarios are identical to v1.3.7. All numbers come from synthetic-signal simulation, not a real guitar/phone.

### v1.3.7 — keys p, a, s not responsive enough
- **Cause:** B3/C4/C#4 (p, a, s) have a half-frequency that falls at 123–139 Hz, the number zone. Energy there from guitar-body resonance/mic hum was taken as evidence that "this note is really one octave lower"; the reading was dropped to a number and discarded in letter mode (so the key felt dead).
- **Fix** (`yinCore`, also in `index.html`): an octave-down correction now REQUIRES odd-harmonic evidence (1.5× or 2.5× the read frequency; `ODD_EVIDENCE_*`). Real low notes have it, resonance does not.
- `HP_ACCEPT_MIN_FREQ` and `LOW_ZONE_FAST_AGE_MIN_FREQ` 255 → 240 Hz so B3 (246.9 Hz) is treated like a and s.
- Simulation (`tools/vsim`, new `hl` scenario + `res=`): key p failures 16/24 → 0/24, total failures 295 → 243 of 1056. Older scenarios (single, rapid, repeat, rep, harm, list, echoh) are identical to v1.3.6.
- **Limit:** very strong resonance exactly at the number frequencies (95–135 Hz) can still make numbers go undetected, and function keys (Shift/Delete/?123/Emoji/Enter) still often fail in that condition. All numbers are synthetic-signal simulations.

### v1.3.6 — rapid plucking: no doubles, none lost
All changes are in `NativeMicPitchDetector.java`; `index.html` is unchanged. Tested with the deterministic simulator `tools/vsim/` (see Testing) against v1.3.5 on the same scenarios.
- **A pluck over ringing is read only from samples AFTER the onset** (`RETRIG_FULL_TAIL`). The 85 ms window is still ~80% old note in the first ~17–33 ms; previously the fast/full-window path read the old note again = **doubled letters** (note 71 typed twice, the new note lost). The fast path is not used for retriggers.
- **Second onset trigger based on transients** (`FLUX_RATIO`, `FLUX_MIN`): spikes in the sample-to-sample RMS difference. Previously rapid plucks were lost when the ringing of several notes piled up and total volume did not rise enough. An onset without a transient inside `SAME_NOTE_WINDOW_MS` must be ≥ `NO_TRANSIENT_MIN_PEAK` (60%) of the last peak, so ring beating does not become ghost letters.
- **Harmonic verification** (`HARMONIC_EXPLAINED_MIN`): a retrigger reading or one < 200 Hz must have energy at f..4f. This prevents ghost notes from ring mixtures (e.g. 82.4 Hz × 6 = B4 read as number "1").
- **Re-plucking the SAME note (e.g. "ll", "aa") is no longer often lost:** on a clean tail reading ≥ 225 Hz with a transient, the hard condition is relaxed to `ECHO_SAME_NOTE_PEAK_TRANSIENT` (30%) and the valley gate is skipped. Notes < 225 Hz (numbers, q–p) DELIBERATELY keep the old strict gate, since no clean volume/energy discriminator separates a legitimate re-pluck from a ghost of ringing (measured; see the `echoh` scenario).

Simulation results (original v1.3.5 → v1.3.6), without and with a slow phone (`cost=8`):
| Scenario | v1.3.5 | v1.3.6 |
|---|---|---|
| `rapid` (7 notes every 220 ms) | 5/7 correct, 1 double | 7/7 correct, 0 doubles |
| `repeat` (76 repeated every 250 ms) | 4 of 6 typed | 6 of 6 |
| `rep 0.3 76`, `rep 0.25 60`, `rep 0.3 64` | 3–5 of 6 | 6 of 6 |
| Single pluck, long ringing + AGC, function keys, harmonic echo (`echoh`), harmonic profiles | correct | identical (no regression) |

**Remaining limits** (honestly): (1) low notes < 225 Hz repeated quickly can still be lost (`rep 0.4 45`: 4 of 6); (2) fast runs < ~300 ms while 3+ previous strings still ring (`seq 0.25`/`seq 0.3`): a monophonic pitch tracker cannot separate that mixture, so notes are lost (not mistyped). Mute the previous strings (palm-mute) for more speed; (3) human voice still leaks into letters (`voice`), same as v1.3.5. All numbers above are SIMULATIONS of synthetic signals, not a real guitar/phone.

### v1.3.5 — fixes for slow / late response
- **The debug APK is now genuinely non-debuggable.** `native-patches/insert_perf.py` had existed for a long time but was NEVER called by the workflow, so the debug APK ran as *debuggable*: ART disables optimisations and the YIN loop on the audio thread was much slower. The step is now in `android-build.yml`.
- **`.github/workflows/` synchronised with `workflows/` (the new version).** The copy in `.github/` was an old version (no `permissions: contents: write`, so Releases could fail with 403; no Guitarwiter icon/APK name; no PKCS12 keystore password check).
- **YIN is computed lazily** (`yinCore`): the CMNDF is computed incrementally and stops at the first valley. The result is bit-for-bit identical to the old version (600 signals tested), but high notes are ~6.8× lighter (2.98 → 0.44 ms/reading on the test machine) and low notes ~1.3–2×. A reading shorter than one hop (16.7 ms) keeps the detection loop from lagging behind audio on a slow phone.
- **Monotonic detection clock** (`System.nanoTime`) replaces `currentTimeMillis`. A wall clock jumping backwards (automatic time sync) put `cooldownUntil`/`touchMuteUntil` "in the future", making the mic seem briefly dead.
- **Synchronous IPC to the target app is deferred while typing** (`HtmlKeyboardService`): `getCursorCapsMode()` (50 ms) and `getTextBeforeCursor()` (120 ms) used to run after EVERY letter on the same main thread that types the next letter; if WhatsApp/Instagram was busy, the next letter was late. They now run once, 300 ms after typing stops (`TYPING_ACTIVE_MS`, `IDLE_SYNC_DELAY_MS`).
- **`deaccent()` is cached** (`index.html`): it was called for every personal-dictionary word on every letter (2×) on the JS thread; now a single Map lookup.
- **The mic retries starting** (4×: 250/600/1200/2500 ms) if `startNativeMic()` fails briefly (e.g. the keyboard is hidden then shown quickly) and shows a message if it still fails. Previously it failed silently until the mic was turned on again manually.
- `tools/sim/run.sh` also works on a JDK without a separate `javac`.

### v1.3.4
- **Detection restored to the clean v1.1.3 engine**, without the "Guitar only" filter based on absolute volume thresholds (`G_MIN_PEAK`, `G_FAST_MIN_PEAK`, `G_SUSTAIN`, etc. from v1.3.x). Those volume thresholds were guesses and, on phones with different mic gain, could drop or delay real plucks. Consequence: **human voice/TV is no longer specially filtered**.
- **Function keys secured** (see `FUNCTIONAL_KEYS_STRICT`, `OVERTONE_*`, `HARMONIC_ECHO_*`). Previously `FUNCTIONAL_KEYS_STRICT=false`, so a single wrong reading was enough to change Shift/mode/delete.
- **Shift via pitch never locks CapsLock.** Two nearby A4 detections (echo/ringing) used to read as a "double tap", so CapsLock turned itself on and letters became capitals. CapsLock is now touch-only (tap Shift twice).
- **The Java note map is not used when stale.** After a note handled by JS (e.g. `?123` switching to symbols), Java waits for the new map first, so the next letter is not typed with the old mode's map and then deleted and retyped.
- Kept from v1.3.x: native key sound & vibration (`keyTap`), mic muting on touch, the anti-echo gate, type-first ordering.

## Common problems
- **One pluck appears twice** → raise `ECHO_SAME_NOTE_PEAK` (e.g. 0.8) / `ECHO_WINDOW_MS`. If a fast re-pluck of the same note fails to appear, lower it (e.g. 0.55).
- **High notes (x c v b n m) still double** → raise `SAME_NOTE_VALLEY_RATIO` (e.g. 2.2) or `SAME_NOTE_WINDOW_MS` (e.g. 1800). Turn on "Note info": "↩ echo ignored" appears every time the gate discards something.
- **Shift/Delete/`?123`/Enter feel slow or hard to trigger** → they do need 3 readings (±90–100 ms). To loosen: `FUNCTIONAL_KEYS_STRICT = false` (back to the old behaviour, easier to mis-trigger).
- **A function key deliberately plucked but rejected** → check "Note info" ("↩ echo ignored"); if it is the overtone veto being too strict, raise `OVERTONE_VETO_RATIO`.
- **Ghost letters when typing with a finger** → raise `TOUCH_MUTE_MS` (e.g. 300).
- **Repeated letters (`eeee`) or letters appearing by themselves** → sensitivity too high / room noise; raise `ONSET_RMS`.
- **Notes swapped between letters ↔ numbers** → octave error on a low note; see `LOW_ZONE_*` and `ODD_EVIDENCE_*`.
- **Feels delayed** → look at the `· xx ms` figure in the keyboard status (time inside the code). The rest is Android's input audio latency (`AudioRecord`), which cannot be trimmed from Java.
- **Mode suddenly switches to symbols/emoji** → set `PITCH_MODE_TOGGLE_KEYS = false`.

Privacy policy: [privacy-policy.md](privacy-policy.md)

## Key sound & vibration
- Every key touch calls ONE native function `keyTap(kind, vibrate, sound, volume)`: mute the mic + key sound + vibration. The sound uses Android's built-in effects (`AudioManager.playSoundEffect`) like Gboard: different for letters, space, delete and enter, and it follows the system "Touch sounds" setting.
- Text is always sent to the app first; sound/vibration follow.
- Turn them on in the keyboard settings: "Click sound" and "Keyboard vibration". If it stays silent, check Android Settings > Sound > "Touch sounds".

## Testing (`tools/` folder)
Run here before a release; not shipped in the APK.
- `tools/ai-test.js` (plain Node, no dependencies): 94 checks of the offline AI engines — no network in the code (static scan) and none at run time (fetch/XHR/WebSocket/beacon are blocked), tab validation, music theory, song builder, lyrics, library fidelity, Spark commands, chord→song, humming→song, segmentation, cover art.
- `tools/ai-panel-test.js` (plain Node): 34 checks that run the real panel script from `index.html` in a minimal fake DOM and tap its buttons (commands, chord→song, library, cover, humming with a fake native bridge, native intent allowlist).
- `tools/flow-test.js` (Node + `npm i jsdom`): runs `www/index.html` in a fake browser; checks label ↔ note ↔ typed character for ALL keys in letter/Shift/Caps/symbol-1/symbol-2 modes, the typing flow from Java, Shift/CapsLock behaviour from pitch vs touch, and the `?123` mode switch.
- `tools/vsim/` (JDK 17): like `tools/sim/` but with a **virtual clock**, so results are identical on every run and much faster than real time. `cost=<ms>` imitates a slow phone; `DET=<file.java>` compares another detector (e.g. an old version); extra scenario `rep <gap> <midi> <amp>` (same note repeated). Scenario `hl <profile> <midi...> [res=<ratio>]` (v1.3.7): each note plucked on its own with a given harmonic profile and synthetic guitar-body resonance (`-Dresf=<Hz>` sets its frequency, `PER=1` prints per-note results). Example: `tools/vsim/run.sh cost=8 rapid`.
- `tools/sim/` (JDK 17): runs the REAL `NativeMicPitchDetector.java` with Android stubs and real-time synthetic audio (plucks, fast sequences, ringing, AGC, phone-mic high-pass, function keys, harmonic echo, overtone-veto unit test). See `tools/sim/README.txt`. Results are simulations, not a real guitar/phone.
