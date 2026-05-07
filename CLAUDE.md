# Tonemap.live — Claude/AI Assistant Guide

## What This Project Is

Tonemap.live is a browser-based real-time pitch and intonation visualizer for musicians. It detects pitch from the microphone and maps it onto a color-coded grid showing intonation tendencies. Single-developer project; amateur coder. Prefer clarity and correctness over cleverness.

---

## File Roles (Critical)

| File | Role |
|---|---|
| `beta-451.html` | **Active development file.** All new features go here first. Currently ahead of `index.html` — has the full recorder, spectrum visualizer, slow-motion playback, deactivation flow, and more. |
| `index.html` | **Production (free-tier public app).** Gets updated by merging finished, tested features from `beta-451.html`. Currently ~1200 lines shorter — missing the full recorder. Do not add half-finished features here. |
| `worker/index.js` | Cloudflare Worker handling `/activate`, `/pro`, `/deactivate`, `/license-info`. |
| `worker/wrangler.toml` | Worker routing config. Routes are live for `tonemap.live` and `www.tonemap.live`. |
| `mictest.html` | Standalone mic/audio diagnostic page. Unrelated to main app. |
| `terms.html` | Terms of service page. |

**The Pro app** is served from Cloudflare KV key `pro-app.html` (namespace ID `25916307ce9d4005b0998afe806127e2`) — it is not a file in the repo.

---

## Architecture

- **Single-file app**: All HTML, CSS, and JS live in one file (no build step, no bundler, no npm).
- **Audio**: Web Audio API + `pitchy@4.0.1` for pitch detection. `AudioContext` → `AnalyserNode` (fftSize 2048, smoothingTimeConstant 0) → pitch detection loop.
- **Recorder**: Uses the same `analyserNode` for the live spectrum visualizer during recording. PCM chunks captured via `AudioWorkletProcessor`. SoundTouch for slow-motion playback.
- **Hosting**: Cloudflare Pages (static) + Cloudflare Worker (auth/pro delivery).
- **Auth**: Polar.sh license keys → HMAC-signed `tm_pro` cookie → Worker serves Pro HTML from KV.
- **Payments**: Polar.sh (`@polar-sh/checkout` embed). Checkout URL: `https://buy.polar.sh/polar_cl_2vJBu3kHvJVg00nn8LG8cTBqyiYsiPXks9hZU4XQYse`.

---

## Free vs Pro Feature Split

Free tier is enforced client-side via `FREE_ALLOWED` and `isProLockedValue()`. Attempting to set a Pro value triggers the upgrade modal. The Pro app (served from KV at `/pro`) has no such restrictions.

| Feature | Free | Pro |
|---|---|---|
| Mode | Relaxed, Medium | + Hard |
| History | Short (1s), Medium (3s) | + Long (30s), Unlimited |
| Color Hold | 30s only | + 5s, 15s, 2min, 5min, No Fade |
| Performance Pitch | 440, 441, 442 | All presets + custom |
| Transposition | C only | All keys |
| Stretch Tuning | None, Minimal | + Medium, Full (Railsback) |
| Rows start with | C only | Any note |
| Recorder | ✗ (not yet in index.html) | ✓ (in beta-451.html) |

---

## Key JS Patterns

### State
- `currentSettings`: central settings object, persisted to localStorage.
- `cellState[midiNote]`: per-note history (`totalVoiceMs`, `segments`, `colorRGB`, `visited`).
- `recorderState`: recorder/playback state, including `spectrumSmoothed` (Float32Array) and `spectrumFreqBuffer` for the live spectrum visualizer.
- `activeNoteInfo`: currently playing note.

### Pro Gating
```js
const FREE_ALLOWED = Object.freeze({
  sensitivity: new Set(["relaxed", "medium"]),
  history: new Set(["short", "medium"]),
  stainHold: new Set(["30"]),
  a4: new Set([440, 441, 442]),
});
function isProLockedValue(type, value) { ... }
function openProModal(featureKey) { ... }
```

### Recorder Spectrum (beta-451.html only)
- Constants: `RECORDER_SPECTRUM_POINTS = 48`, `RECORDER_SPECTRUM_MIN_HZ = 80`, `RECORDER_SPECTRUM_MAX_HZ = 8000`, `RECORDER_SPECTRUM_EMA_ALPHA = 0.15`
- During recording: reads FFT data each rAF frame, applies EMA smoothing, draws a quadratic bezier curve (red stroke).
- After recording: shows white waveform peaks + green playhead.

### CSS Variables
```css
--bg-main: #0f172a
--bg-panel: #1e293b
--text-dim: #94a3b8
--text-lite: #f8fafc
--accent-green: rgb(34,197,94)
--pitch-color-sharp: rgb(249,115,22)
--pitch-color-center: rgb(34,197,94)
--pitch-color-flat: rgb(147,51,234)
```

---

## ⚠️ Critical Constraints

### xattr / macOS Provenance Bug
Files written by Claude Code's Write/Edit tools get a `com.apple.provenance` extended attribute. This causes `wrangler` (esbuild) to **silently time out** when building `worker/index.js` or `worker/wrangler.toml`.

**Rule**: Never use Write/Edit on `worker/index.js` or `worker/wrangler.toml`. If those files need changes, Jeremy does it from his terminal, or uses this strip-and-recreate pattern:
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
Static files (`index.html`, `beta-451.html`, etc.) served by Cloudflare Pages are **not affected** — edit those freely.

### Single-File Constraint
Do not propose splitting into separate JS/CSS files, introducing a build step, or adding npm dependencies. The single-file, no-build architecture is intentional and must be preserved.

### Never touch `index.html` with in-progress features
`index.html` is production. Only merge from `beta-451.html` when a feature is finished and tested.

---

## Worker Routes (Live)
```
tonemap.live/activate*   → handleActivatePage / handleActivate
tonemap.live/pro         → handlePro (serves KV if valid cookie)
tonemap.live/deactivate  → handleDeactivate
tonemap.live/license-info → handleLicenseInfo
www.tonemap.live/*       → same routes
```

Cookie: `tm_pro` (HMAC-signed, 365-day max-age). Revalidation against Polar every 24h, 6h grace period.

---

## Current Status (as of 2026-05-06)

**In `beta-451.html` (dev), not yet in `index.html` (prod):**
- Full Quick Recorder (record, slow-motion playback, WAV download)
- Live spectrum visualizer during recording
- Deactivation flow (`/deactivate` endpoint + UI)
- License info endpoint (`/license-info`)
- Various mobile layout and mic fixes from recent commits

**Done and live in both files:**
- Free/Pro split with Polar.sh checkout
- Pro modal with feature highlight animations
- Worker auth (HMAC cookie, KV delivery)
- Railsback stretch tuning
- All transposition options (Pro)
- Release notes / what's new UI

**Docs folder:**
- `docs/plans/` — detailed implementation plans (may be partially or fully complete; verify against actual files before acting on them)
- `docs/superpowers/` — spec for the spectrum visualizer (implemented in beta-451.html)

---

## Common Tasks

### Adding a new control
1. Add HTML in the options panel (`right-scroll` section)
2. Update `updateDebugPanel()` if needed
3. Add DOM ref near other `getElementById` calls (~line 4248 in beta)
4. Wire event listener in init section
5. Add to `currentSettings` default and `applySettingsToUI()` normalization

### Updating Pro KV content
```bash
cd worker
wrangler kv key put --remote \
  --namespace-id=25916307ce9d4005b0998afe806127e2 \
  "pro-app.html" --path="../beta-451.html"
```

### Deploying worker changes
```bash
cd worker
# Strip xattr first if files were edited by Claude Code
wrangler deploy
```
