# 🎸 GuitarWiter — Guitar-to-Keyboard

A custom Android keyboard that turns **guitar notes into typing**. Pluck one note → one letter/key appears in any text field (WhatsApp, Instagram, etc.). Pitch detection runs natively (AudioRecord + YIN) inside the app, while the keyboard UI is a web page (`www/`) inside an `InputMethodService` WebView.

## GuitarWiter + Meta Integration

This project uses the **Meta Model API (Muse Spark)** for guitar-to-lyrics generation. The app currently calls only `muse-spark`; the model name can be changed in the AI panel.

### How it works
1. **Mic capture:** the microphone is captured natively (`AudioRecord`, not the Web Audio API) and analysed on-device with YIN pitch detection. This part works fully offline.
2. **Chord input:** the pitch detector is **monophonic** (one note at a time), so there is **no automatic chord recognition**. The chord (for example `Em A D G`) is typed into the AI panel.
3. **Generation:** chord → Meta Model API → **2 lines of Indonesian lyrics + Bass and Drum tabs + a guitar tab**. The guitar tab replaces the active tab; the lyrics and the bass/drum tabs are shown in the panel.

### Meta API config
| Item | Value |
|---|---|
| Model | `muse-spark` (online access after the hackathon credits are released, as announced by the organizers) |
| Endpoint | `https://api.dev.meta.ai/v1/chat/completions` |
| Auth | Bearer token from Discord `#meta` |
| Defaults live in | the `setup()` function of the AI block at the bottom of `www/index.html` |

The endpoint and the request/response format come from the app owner's notes and are **not verified against official documentation**. If the real API differs, adjust it in the AI panel (address, path, model) or through `GWAI.hooks.spark.mapRequest / mapResponse`.

### Prompt language
The **system prompt is in English** for Meta model compatibility, but the **lyrics are requested in Indonesian (Bahasa Indonesia)**. The prompt lives in `www/ai/editor.js` (`CHORD_SYS`, `chordPrompt`); the lyric style (`LYRIC_STYLE`, default "Galau, cinta, anak Bandung") and the number of lines (`LYRIC_LINES`, default 2) are constants at the top of that block.

Code convention: roughly 90% of identifiers and comments are Indonesian; only the prompt strings sent to Meta are English.

### Setup
**There is no key constant in the code** (no `META_KEY`, no placeholder to replace). A key embedded in the app can be extracted from the APK by anyone. Instead:
1. Claim your Meta API key (hackathon: Discord `#meta`).
2. Open **Settings → AI Panel (Muse) → "⚙ API: key & service address"**, paste the key, press **Save key**. It is stored on the device only (`localStorage['meta_key']`).
3. Turn on **Settings → Experimental → "AI features (Muse)"** (off by default).
4. In the panel, type a chord and press **Chord → Lyrics + Tab [Muse Spark]**.

For a public release, route calls through your own server-side proxy that holds the key.

> The app UI itself is in Indonesian. The menu names above map to: *Settings → Panel AI (Muse) → "⚙ API: kunci & alamat layanan" → Simpan kunci*, *Setelan → Eksperimental → "Fitur AI (Muse)"*, and the button *"Chord → Lirik + Tab [Muse Spark]"*.

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
  ai/  ai-core.js  editor.js  generate-full.js  waveform.js   # Meta/Muse modules (off by default)
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

### v1.4.3 — English prompt, Indonesian lyrics, retry, README in English
- The chord→lyrics prompt is now an **English** system prompt (songwriter AI, "Language output: MUST be Bahasa Indonesia", style "Galau, cinta, anak Bandung", Bass and Drum tabs) with the user message `Input chord: <chord>`. The reply is one JSON object `{lyrics, bass_tab, drum_tab, tab}`; the old `{lirik, band}` shape is still accepted.
- **More reliable API calls:** a JSON object wrapped in extra sentences is still parsed; one automatic retry (after 1.5 s) on `429`, `5xx`, timeout or network errors; no retry on `401`/`404` (wrong key or address).
- `www/ai/editor.js` is the single place for the prompt, style and number of lines. Whole README translated to English and the Meta Integration section added.
- Tests: `node tools/ai-test.js` now runs 53 checks.

### v1.4.2 — dev API address + chord → lyrics + tab
- **Spark default** is now `https://api.dev.meta.ai` + `/v1/chat/completions`, model `muse-spark` (from the app owner's snippet; unverified). Previously saved v1.4.0/1.4.1 addresses are migrated automatically; user-entered addresses are left alone. Wonder stays `https://api.meta.ai/muse/wonder` (no dev host known yet).
- `window.metaGenerate(chord)`: never throws, returns the lyrics text. A chord field + button in the AI panel.
- **The key is NOT embedded in code.** Paste it in the AI panel.

### v1.4.1 — API key & address fields in the AI panel
- The panel has an **"API: key & service address"** section: the key (stored in `localStorage['meta_key']`, not in `gwai_cfg_v1`) and the address/path/model per service (Spark, Wonder, SAM 3.1, Image), editable from the phone without DevTools. Logic in `GWAI.saveKey/clearKey/hasKey/saveService` (`ai-core.js`).
- Validation: key 8–512 characters without spaces/quotes; address **`https://` only** (the key must never be sent over plain http); path only `A-Za-z0-9._~/-`. Emptying an address restores the default.

### v1.4.0 — pluck sound removed + Muse AI modules
- **The guitar-pluck sound when typing (v1.3.9) was removed:** code, the "Guitar pluck sound" and "Pluck volume" settings are gone. The old click sound is unchanged.
- **AI modules**, all **OFF by default** (`prefs.ai=false`, Settings → Experimental → "AI features (Muse)"). While off, no AI script is loaded and no network call is made. The panel opens from Settings → "AI Panel (Muse)".

| Feature | Code location | What it does |
|---|---|---|
| Shared core | `www/ai/ai-core.js` | configuration, safe HTTP caller (timeout, never throws), tab model + validation, undo, ASCII tab |
| Muse Spark | `www/ai/editor.js`, `[LABEL MUSE SPARK]` in `index.html`, `[LABEL MUSE SPARK / INTENT]` in `HtmlKeyboardService.java` + `MainActivity.java` | command ("make it bluesy") → active tab changed immediately; `window.makeItBluesy()` |
| Muse Wonder | `www/ai/generate-full.js`, `[LABEL MUSE WONDER]` in `index.html`, `NativeMicPitchDetector.java` + `HumRecorder.java` + bridge `getLast30SecAudio()` | 30 s of humming → ~3 minute song tab; `window.generateFullSong()` |
| SAM 3.1 | `www/ai/waveform.js`, `[LABEL SAM 3.1 / WAVEFORM]` in `HtmlKeyboardService.java` | segmentation over the waveform; native calls `window.onWaveformClick(freq, idx)` |
| Muse Image | `www/ai/waveform.js` | cover art from a description (only `https://` or PNG base64 is accepted) |

- SAM and Image have no default endpoint (empty = inactive). The request/response formats in the modules are an **adapter contract**, not an official vendor specification; adapt them with `GWAI.hooks.<service>.mapRequest/mapResponse`.
- AI answers are always **validated** (strings 1–6, frets 0–24, MIDI 40..83); a broken answer leaves the tab **unchanged**. Output is written with `textContent`, never `innerHTML`.
- **Spark intent:** `AndroidKeyboard.triggerSpark('bluesy')` opens `MainActivity` (flags `NEW_TASK|SINGLE_TOP|CLEAR_TOP`) and runs `window.onSparkTrigger('bluesy')`. Set `SPARK_USE_INTENT=false` to run Spark inside the keyboard WebView without opening the app. **A "special chord" trigger does not exist:** the detector is monophonic.
- `HumRecorder.java` is new (copied by a new workflow step). The 30 s recording (mono 16-bit, ~14.7–16 kHz, ~0.9 MB) lives only in memory and only while recording is active.
- `privacy-policy.md` gained section 6 (optional AI features).

### v1.3.9 — guitar-pluck sound per key (removed again in v1.4.0)
Each finger-touched key played an additively synthesized pluck at the key's own note (44/44 notes within ±6 cents when verified from source). Removed in v1.4.0 by request.

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
- **AI panel shows "Not configured" / `http-401` / `http-404`** → the key or address is missing or wrong; check the "API: key & service address" section. `http-429`/`5xx` are retried once automatically.

Privacy policy: [privacy-policy.md](privacy-policy.md)

## Key sound & vibration
- Every key touch calls ONE native function `keyTap(kind, vibrate, sound, volume)`: mute the mic + key sound + vibration. The sound uses Android's built-in effects (`AudioManager.playSoundEffect`) like Gboard: different for letters, space, delete and enter, and it follows the system "Touch sounds" setting.
- Text is always sent to the app first; sound/vibration follow.
- Turn them on in the keyboard settings: "Click sound" and "Keyboard vibration". If it stays silent, check Android Settings > Sound > "Touch sounds".

## Testing (`tools/` folder)
Run here before a release; not shipped in the APK.
- `tools/ai-test.js` (plain Node, no dependencies): 53 checks of the AI modules with `fetch` and the native bridge mocked — request format, key from `localStorage`, broken answers rejected, job polling, retry on `429`/`5xx`, SAM segment validation, image URL validation, key/address validation, chord → lyrics.
- `tools/flow-test.js` (Node + `npm i jsdom`): runs `www/index.html` in a fake browser; checks label ↔ note ↔ typed character for ALL keys in letter/Shift/Caps/symbol-1/symbol-2 modes, the typing flow from Java, Shift/CapsLock behaviour from pitch vs touch, and the `?123` mode switch.
- `tools/vsim/` (JDK 17): like `tools/sim/` but with a **virtual clock**, so results are identical on every run and much faster than real time. `cost=<ms>` imitates a slow phone; `DET=<file.java>` compares another detector (e.g. an old version); extra scenario `rep <gap> <midi> <amp>` (same note repeated). Scenario `hl <profile> <midi...> [res=<ratio>]` (v1.3.7): each note plucked on its own with a given harmonic profile and synthetic guitar-body resonance (`-Dresf=<Hz>` sets its frequency, `PER=1` prints per-note results). Example: `tools/vsim/run.sh cost=8 rapid`.
- `tools/sim/` (JDK 17): runs the REAL `NativeMicPitchDetector.java` with Android stubs and real-time synthetic audio (plucks, fast sequences, ringing, AGC, phone-mic high-pass, function keys, harmonic echo, overtone-veto unit test). See `tools/sim/README.txt`. Results are simulations, not a real guitar/phone.
