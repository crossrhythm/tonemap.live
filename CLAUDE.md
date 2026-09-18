# Tonemap.live — Claude/AI Assistant Guide

## What This Project Is

Tonemap.live is a browser-based real-time pitch and intonation visualizer for musicians. It detects pitch from the microphone and maps it onto a color-coded grid showing intonation tendencies. Single-developer project; amateur coder. Prefer clarity and correctness over cleverness.

---

## File Roles (Critical)

| File | Role |
|---|---|
| `beta.html` | **Active development file (free-tier beta).** A fork of `index.html`, **not** of `beta-451.html` — it has no recorder. Ahead of prod with: temperaments + pitch center + Custom editor, decimal A4 (0.1 Hz), double-tap-zoom suppression, and Hard Mode **unlocked for the beta only**. The test suite runs against all three builds (`node --test tests/*.test.cjs`); the frozen fixture in `tests/fixtures/` was generated from this file. |
| `index.html` | **Production (free-tier public app).** Hard Mode implemented but Pro-gated, no recorder. Same code as beta.html as of 2026-09 apart from the gate and page metadata. Receives finished, tested features from `beta.html`. Do not add half-finished features here. |
| `beta-451.html` | **Pro app source.** The file uploaded to Cloudflare KV as `pro-app.html` (see Common Tasks). Has the full recorder, spectrum visualizer, slow-motion playback, deactivation flow, license-info, and Hard Mode with no gates. Also the **reference file for the iOS port** — iOS parity bugs are resolved by reading this file first. |
| `worker/index.js` | Cloudflare Worker handling `/activate`, `/pro`, `/deactivate`, `/license-info`. |
| `worker/wrangler.toml` | Worker routing config. Routes are live for `tonemap.live` and `www.tonemap.live`. |
| `mictest.html` | Standalone mic/audio diagnostic page. Unrelated to main app. |
| `terms.html` | Terms of service page. |

**The Pro app** at `/pro` is served from Cloudflare KV key `pro-app.html` (namespace ID `25916307ce9d4005b0998afe806127e2`). The KV value is a copy of `beta-451.html` uploaded with the command under Common Tasks; the repo file is the source of truth.

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

The split was intentionally simplified post-launch to give free users a better experience. **Only these settings are gated:**

| Feature | Free | Pro |
|---|---|---|
| Mode (sensitivity) | Relaxed, Medium — **`beta.html` only: + Hard, unlocked for the beta** | + Hard |
| History | All options | Same |
| Color Hold | All options | Same |
| Performance Pitch (A4) | Full 100–1000 Hz range + custom | Same |
| Quick Recorder | ✗ (not in `index.html` or `beta.html`) | ✓ (`beta-451.html`) |

**Free for everyone (not gated):** Performance Pitch (A4), History, Color Hold, Transposition (all keys), Stretch Tuning (None / Minimal / Medium / Full Railsback), "Rows start with" (any note), accidentals, palette colors, Note View, mic gain / noise reduction, all other UI options.

If you're tempted to add a Pro gate to a setting that isn't in the table above, stop — that's a deliberate product decision, not an oversight.

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
});
function isProLockedValue(type, value) { ... }
function openProModal(featureKey) { ... }
```
That table is `index.html`'s. In `beta.html` it is `Object.freeze({})` — Hard Mode is deliberately unlocked there for the beta. **When porting `beta.html` features to `index.html`, keep `index.html`'s gate; the unlock does not travel.** `beta-451.html` has no `FREE_ALLOWED` at all (Pro build). `isProLockedValue()` returns `false` for any type absent from the table, so the listeners that call it need no changes in either direction.

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
Static files (`index.html`, `beta.html`, `beta-451.html`, etc.) served by Cloudflare Pages are **not affected** — edit those freely.

### Single-File Constraint
Do not propose splitting into separate JS/CSS files, introducing a build step, or adding npm dependencies. The single-file, no-build architecture is intentional and must be preserved.

### Never touch `index.html` with in-progress features
`index.html` is production. Only merge from `beta.html` when a feature is finished and tested, and keep Hard Mode gated when you do. `beta-451.html` is a separate Pro build — features must be ported to it explicitly; nothing flows there automatically.

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

## Feature Parity Matrix (as of 2026-09-17)

Four divergent builds share one lineage. Check this table before assuming a feature exists in the file you're editing. iOS column verified against `../tonemap-ios` on 2026-09-17 except where marked.

| Feature | `index.html` (free prod) | `beta.html` (free beta) | `beta-451.html` (Pro / KV) | iOS |
|---|---|---|---|---|
| Temperaments, Pitch Center, Custom editor, banner pill | ✓ | ✓ | ✓ | ✗ (only the word, in a stretch label) |
| Decimal A4 — 0.1 Hz; input not clobbered while typing | ✓ | ✓ | ✓ | ✓ `Double`; field re-formats only when unfocused |
| Double-tap-zoom suppression (`touch-action: manipulation`) | ✓ | ✓ | ✓ | n/a |
| Hard Mode — implemented (`HARD_DEADZONE_RATIO`, `biasHard`) | ✓ present, gated | ✓ | ✓ | ✓ |
| Hard Mode — gated to Pro | ✓ | ✗ **beta unlock** | n/a (Pro build) | ✓ `pro.isPro` |
| Quick Recorder + spectrum visualizer | ✗ | ✗ | ✓ | ✓ recorder, Pro-gated |
| Deactivation flow, `/license-info` | ✗ | ✗ | ✓ | n/a (Polar key + StoreKit) |
| Railsback stretch, transposition, Note View | ✓ | ✓ | ✓ | ✓ |
| Release notes / what's new UI | ✓ | ✓ | ✓ | ✗ as of 2026-07-08 (unverified since) |
| Pro upgrade modal | ✓ | ✓ | ✗ (nothing to upsell) | ✓ `ProUpgradeSheet` |

**Ported 2026-09 (web):** temperaments + decimal-A4 fix + touch-action are in all three web builds; `node --test tests/*.test.cjs` proves they compute identical targets. iOS port pending — its oracle is `tests/fixtures/temperament-vectors.json`.

**Docs folder:**
- `docs/temperments.md` — temperament domain reference (data model, reference convention, verified cent tables). Durable; not a task list.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans. May be partially or fully complete; verify against actual files before acting on them.
- `docs/plans/` — older implementation plans, same caveat.
- `tests/` — run `node --test tests/*.test.cjs` (~40 s; no npm). `tuning-harness.cjs` regex-extracts the real tuning engine out of a build and runs it in a `vm`; `temperament.test.cjs` and `fixture-parity.test.cjs` run against every build (`TONEMAP_TARGETS=beta.html` to narrow); `pro-gate.test.cjs` proves Hard Mode is locked in `index.html` and unlocked in `beta.html`; `generate-temperament-vectors.cjs` regenerates `fixtures/temperament-vectors.json`, the parity oracle the iOS port is tested against.

---

## Common Tasks

### Adding a new control
1. Add HTML in the options panel (`right-scroll` section)
2. Update `updateDebugPanel()` if needed
3. Add DOM ref near the other `getElementById` calls (search for `getElementById("aRefInput")` — line numbers drift)
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
