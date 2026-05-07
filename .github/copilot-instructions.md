# Tonemap.live — AI Assistant Guide

## Project Overview

Tonemap.live is a browser-based real-time pitch and intonation visualizer for musicians. It detects pitch via microphone and maps it to a color-coded grid showing intonation tendencies over time. Single-developer project (amateur coder). Prefer clarity and correctness over cleverness.

---

## File Roles

| File | Role |
|---|---|
| `beta-451.html` | **Active development file.** All new features go here first. Currently ahead of `index.html` — has full recorder, spectrum visualizer, slow-motion playback, deactivation UI, and more. |
| `index.html` | **Production (free-tier public app).** Updated by merging finished, tested features from `beta-451.html`. Do not add half-finished features here. |
| `worker/index.js` | Cloudflare Worker: `/activate`, `/pro`, `/deactivate`, `/license-info`. |
| `worker/wrangler.toml` | Worker routing config — routes live on `tonemap.live` and `www.tonemap.live`. |
| `mictest.html` | Standalone mic/audio diagnostic. Unrelated to main app. |

**The Pro app** is not a repo file. It is served from Cloudflare KV key `pro-app.html` (namespace `25916307ce9d4005b0998afe806127e2`) only to authenticated users at `/pro`.

---

## Architecture

- **Single-file app**: All HTML, CSS, and JS in one file. No build step. No npm. No bundler. This is intentional — do not propose splitting files or adding a build pipeline.
- **Audio pipeline**: Web Audio API + `pitchy@4.0.1`. `AudioContext` → `AnalyserNode` (fftSize 2048, smoothingTimeConstant 0) → real-time pitch detection loop at ~60fps.
- **Recorder**: PCM captured via `AudioWorkletProcessor`. Reuses existing `analyserNode` for live spectrum visualization during recording. SoundTouch for slow-motion playback.
- **Hosting**: Cloudflare Pages (static files) + Cloudflare Worker (auth and Pro content delivery).
- **Auth**: Polar.sh license keys → Worker validates → sets HMAC-signed `tm_pro` cookie → `/pro` serves Pro HTML from KV.
- **Payments**: Polar.sh embed (`@polar-sh/checkout`).

---

## Free vs Pro Feature Split

Free-tier enforcement is client-side via `FREE_ALLOWED` + `isProLockedValue()`. Selecting a locked value triggers the upgrade modal rather than applying the change. The Pro app (from KV) has no restrictions.

The split was intentionally simplified post-launch to keep the free experience uncluttered. **Only these settings are gated:**

| Feature | Free | Pro |
|---|---|---|
| Mode (sensitivity) | Relaxed, Medium | + Hard |
| History | Short (1s), Medium (3s) | + Long (30s), Unlimited |
| Color Hold | 30s only | + 5s, 15s, 2min, 5min, No Fade |
| Performance Pitch (A4) | 440, 441, 442 | All presets + custom |
| Quick Recorder | ✗ (not yet in index.html) | ✓ (in beta-451.html) |

**Free for everyone (not gated):** Transposition (all keys), Stretch Tuning (None / Minimal / Medium / Full Railsback), "Rows start with" (any note), accidentals, palette colors, Note View, mic gain / noise reduction, all other UI options.

If you're tempted to add a Pro gate to a setting that isn't in the table above, stop — that's a deliberate product decision, not an oversight.

---

## Key Data Structures

```js
// Central settings — persisted to localStorage
currentSettings = { a4, sensitivity, history, stainHold, stretch, transposition, ... }

// Per-note history (keyed by MIDI note number)
cellState[midiNote] = { totalVoiceMs, segments, colorRGB, visited }

// Recorder/playback state
recorderState = {
  isRecording, isPlaying, durationMs, waveformPeaks,
  spectrumSmoothed,    // Float32Array(48) — EMA-smoothed FFT for spectrum viz
  spectrumFreqBuffer,  // Uint8Array(frequencyBinCount) — raw FFT read buffer
  playbackRate, playbackOffsetMs, ...
}

// Currently detected note
activeNoteInfo = { midiNote, frequency, clarity, ... }
```

## Pro Gating Pattern

```js
const FREE_ALLOWED = Object.freeze({
  sensitivity: new Set(["relaxed", "medium"]),
  history: new Set(["short", "medium"]),
  stainHold: new Set(["30"]),
  a4: new Set([440, 441, 442]),
});

function isProLockedValue(type, value) { ... }
function openProModal(featureKey) { ... }  // highlights the relevant feature in the modal
```

## Recorder Spectrum Visualizer (beta-451.html)

Constants: `RECORDER_SPECTRUM_POINTS = 48`, `RECORDER_SPECTRUM_MIN_HZ = 80`, `RECORDER_SPECTRUM_MAX_HZ = 8000`, `RECORDER_SPECTRUM_EMA_ALPHA = 0.15`

During recording: reads FFT each rAF frame → applies per-bin EMA smoothing → draws a smooth quadratic bezier curve in recording red (`rgba(248,113,113,0.88)`). After recording stops: switches to white waveform peaks + green playhead (unchanged from pre-recorder behavior).

---

## CSS Variables

```css
--bg-main: #0f172a
--bg-panel: #1e293b
--text-dim: #94a3b8
--text-lite: #f8fafc
--accent-green: rgb(34,197,94)
--pitch-color-sharp: rgb(249,115,22)
--pitch-color-center: rgb(34,197,94)
--pitch-color-flat: rgb(147,51,234)
--err-color: #ef4444
--warn-color: #facc15
```

---

## ⚠️ Critical Constraints

### xattr / macOS Provenance (Wrangler Bug)
Files written by AI coding tools (Claude Code Write/Edit, Copilot, etc.) acquire a `com.apple.provenance` extended attribute on macOS Sequoia. This causes `wrangler`/esbuild to **silently time out** on `worker/index.js` and `worker/wrangler.toml`.

**Never write to worker files with AI tools.** If worker files need changes, edit from the macOS terminal, or strip the attribute first:
```bash
python3 -c "
import os
for fname in ['worker/index.js', 'worker/wrangler.toml']:
    with open(fname, 'r') as f: content = f.read()
    os.remove(fname)
    with open(fname, 'w') as f: f.write(content)
print('xattr cleared')
"
```
Static HTML/CSS/JS files served by Cloudflare Pages are **not affected**.

### No Build Step
Do not suggest splitting into multiple files, adding bundlers, or npm dependencies.

### index.html is Production
Never put in-progress features in `index.html`. Develop in `beta-451.html`, merge when done and tested.

---

## Worker Routes

```
GET/POST  /activate*     — license activation page + handler
GET       /pro           — serves Pro HTML from KV if cookie valid, else → /activate
POST      /deactivate    — removes device activation
GET       /license-info  — returns license status JSON
```

Auth cookie: `tm_pro` (HMAC-signed, 365-day). Revalidates with Polar every 24h (6h grace period).

---

## Common Tasks

### Add a new option/control
1. Add HTML in the options panel (`right-scroll` section)
2. Add `getElementById` ref near other DOM refs (~line 4248 in beta)
3. Add to `currentSettings` defaults and `applySettingsToUI()` normalization
4. Wire event listener in the init section
5. Update `updateDebugPanel()` if it should appear in the debug overlay

### Update Pro KV content after changes to beta-451.html
```bash
cd worker
wrangler kv key put --remote \
  --namespace-id=25916307ce9d4005b0998afe806127e2 \
  "pro-app.html" --path="../beta-451.html"
```

### Deploy worker
```bash
cd worker
wrangler deploy   # strip xattr first if worker files were AI-edited
```

### Merge a finished feature from beta to index
1. Verify feature works correctly in `beta-451.html`
2. Identify the diff (specific HTML/JS blocks to add or replace)
3. Apply changes to `index.html` manually or via targeted edits
4. Test `index.html` in browser
5. Commit both files
