# Free/Pro Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `free.html` (gated free-tier app) by copying `index.html`, removing/restricting Pro features at the HTML and JS level, adding an upgrade modal + CTA, and wiring the Cloudflare Worker to production routes on tonemap.live.

**Architecture:** `free.html` is a modified static copy of `index.html` with Pro JS constants removed and UI options restricted. An inline upgrade modal handles Pro prompts. `index.html` is never touched until `free.html` is fully tested and ready to swap. The Cloudflare Worker (already deployed) handles `/activate` and `/pro` once routes are wired in `wrangler.toml`.

**Tech Stack:** Vanilla JS/HTML/CSS (single-file, no build step), Cloudflare Pages (static hosting), Cloudflare Worker + Workers KV, Wrangler CLI v4.68.1, Lemon Squeezy (license validation + checkout).

---

## Approved Feature Split

| Feature | Free | Pro |
|---|---|---|
| Mode | Relaxed, Medium | Hard |
| Rows start with | — (hidden, Pro only) | ✓ |
| Stretch tuning | None, Minimal | Medium, Full |
| Performance pitch | 440, 441, 442 presets only | All presets + custom |
| Transposition | C (+0) only | All keys |
| Accidentals | ✓ | ✓ |
| History | Short (1s), Medium (3s) | Long (30s), Unlimited |
| Color Hold | 30s fixed (no dropdown) | 5s, 15s, 2min, 5min, No Fade |
| Upgrade CTA | "Upgrade to ★ Pro" (replaces coffee link) | — |

**Security approach:** Remove JS constants for discrete Pro features (`HARD_*`, `RAILSBACK_ANCHORS`, `interpolateRailsbackCents`); restrict UI option lists for continuous parameters.

---

## Critical Constraint: xattr Issue (macOS Sequoia)

Files created or edited by Claude Code's Write/Edit tools get a `com.apple.provenance` extended attribute that causes esbuild (used by wrangler) to timeout. **This only affects Worker files** processed by wrangler — `free.html` is a static file served by Cloudflare Pages and is safe to edit with Claude Code.

**If `worker/index.js` or `worker/wrangler.toml` need edits**, recreate them from your terminal:
```bash
python3 -c "
import os
for fname in ['worker/index.js', 'worker/wrangler.toml']:
    with open(fname, 'r') as f: content = f.read()
    os.remove(fname)
    with open(fname, 'w') as f: f.write(content)
print('Worker files recreated — xattr cleared')
"
```

---

## Key File Locations (index.html = 6118 lines)

Line numbers in `free.html` match `index.html` initially and drift as edits accumulate.

| Element | Approx. line | Element/constant |
|---|---|---|
| `aRefInput` + `aRefSelect` | ~1958–1988 | A4 preset control |
| `sensitivitySelect` | ~1999–2004 | Mode select |
| `rowStartSelect` | ~2027–2035 | Rows start with |
| `stretchSelect` | ~2043–2048 | Stretch tuning |
| `transpositionSelect` | ~2071–2095 | Transposition |
| `historySelect` | ~2105–2110 | History |
| `stainHoldSelect` | ~2114–2128 | Color Hold |
| Buy me a coffee link | ~1915 | Footer CTA |
| `const rowStartSelect` (JS) | ~2455 | DOM ref |
| `const sensitivitySelect` (JS) | ~2398 | DOM ref |
| `HARD_DEADZONE_RATIO` (JS) | ~2665–2669 | Hard mode constants |
| `RAILSBACK_ANCHORS` (JS) | ~2672–2682 | Stretch anchor table |
| `HISTORY_WINDOWS` (JS) | ~3016–3021 | History window sizes |
| `STAIN_HOLD_SECONDS` (JS) | ~3023–3031 | Color hold durations |
| `A_REF_PRESET_VALUES` (JS) | ~3058 | A4 valid preset list |
| `interpolateRailsbackCents` (JS) | ~3978–4034 | Railsback interpolation |
| `getStretchCents` (JS) | ~4036–4053 | Stretch cents calculator |
| `applySettingsToUI` (JS) | ~3785 | Settings load/normalize |

---

## Task 1: Create `docs/plans/` directory and commit plan

**Step 1: The plan file already exists at `docs/plans/2026-02-25-free-pro-split.md`**

**Step 2: Commit**
```bash
cd "/Users/jeremyblack/Documents/App Dev/Tonemap files/tonemap.live"
git add docs/
git commit -m "docs: add free/pro split implementation plan"
```

---

## Task 2: Create `free.html` as a copy of `index.html`

`index.html` stays untouched throughout development. All feature gating work happens in `free.html`.

**Step 1: Copy from your terminal (not Claude Code)**
```bash
cd "/Users/jeremyblack/Documents/App Dev/Tonemap files/tonemap.live"
cp index.html free.html
```

**Step 2: Open `free.html` in browser, verify it's identical to `index.html`**

**Step 3: Commit**
```bash
git add free.html
git commit -m "feat: add free.html as working copy of index.html for pro gating"
```

---

## Task 3: Add ★ Pro badge styles and upgrade modal to `free.html`

This scaffolding goes in first so all subsequent gating tasks can reference the CSS classes and modal.

### Step 1: Add CSS styles before `</style>`

Find the `</style>` tag that closes the main style block. Add the following just before it:

```css
/* === PRO GATING STYLES === */
.pro-badge {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #0f172a;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  cursor: pointer;
  vertical-align: middle;
  margin-left: 6px;
  white-space: nowrap;
}
.pro-badge:hover { opacity: 0.85; }
.pro-gated-btn { opacity: 0.4; cursor: not-allowed; }
.upgrade-pro-btn {
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #0f172a;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.upgrade-pro-btn:hover { opacity: 0.85; }
.pro-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.pro-modal-overlay[aria-hidden="true"] { display: none; }
.pro-modal-card {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 12px;
  max-width: 400px;
  width: 100%;
  overflow: hidden;
}
.pro-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #334155;
  font-size: 1.05rem;
  font-weight: 700;
  color: #fbbf24;
}
.pro-modal-body { padding: 16px 20px 20px; }
.pro-modal-body p { margin: 0 0 12px; font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; }
.pro-modal-features {
  margin: 0 0 12px 0;
  padding: 0 0 0 18px;
  font-size: 0.85rem;
  color: #94a3b8;
  line-height: 1.7;
}
.pro-modal-support { font-size: 0.8rem; color: #64748b; }
.pro-modal-btn {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 16px;
  padding: 12px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border: none;
  border-radius: 8px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}
.pro-modal-btn:hover { opacity: 0.9; }
.pro-modal-or { margin-top: 10px; text-align: center; font-size: 0.8rem; color: #64748b; }
.pro-modal-or a { color: #94a3b8; }
```

### Step 2: Add modal HTML just before `</body>`

```html
<!-- Pro Upgrade Modal -->
<div id="proUpgradeModal" class="pro-modal-overlay" aria-hidden="true">
  <div class="pro-modal-card" role="dialog" aria-modal="true" aria-labelledby="proModalTitle">
    <div class="pro-modal-header">
      <span id="proModalTitle">★ Unlock Tonemap Pro</span>
      <button id="proModalClose" class="options-close-btn" type="button" aria-label="Close upgrade modal">✕</button>
    </div>
    <div class="pro-modal-body">
      <p>Start your <strong>7-day free trial</strong>, then $9.99/year (~83¢/month). Cancel anytime.</p>
      <ul class="pro-modal-features">
        <li>Hard Mode — tight deadzone, fast response</li>
        <li>All transpositions (Bb, Eb, F, and more)</li>
        <li>Medium and Full Railsback stretch tuning</li>
        <li>All A4 reference frequencies (392–470 Hz + custom)</li>
        <li>Long and Unlimited pitch history</li>
        <li>Color Hold: 5s, 15s, 2 min, 5 min, No Fade</li>
        <li>Rows start with any note</li>
      </ul>
      <p class="pro-modal-support">Your subscription supports ongoing development of Tonemap.</p>
      <a id="proModalCTA" class="pro-modal-btn" href="PLACEHOLDER_LS_CHECKOUT_URL" target="_blank" rel="noreferrer">
        Start Free Trial →
      </a>
      <div class="pro-modal-or">Already purchased? <a href="/activate">Activate your license →</a></div>
    </div>
  </div>
</div>
```

### Step 3: Add modal JS near the end of the `<script>` block (just before closing `</script>`)

```javascript
  // === PRO UPGRADE MODAL ===
  (function() {
    const modal = document.getElementById('proUpgradeModal');
    const closeBtn = document.getElementById('proModalClose');
    if (!modal) return;
    function openProModal() {
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function closeProModal() {
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    closeBtn?.addEventListener('click', closeProModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeProModal();
    });
    document.querySelectorAll('[data-open-pro-modal], .pro-badge').forEach(el => {
      el.addEventListener('click', openProModal);
    });
    window._openProModal = openProModal;
  })();
```

### Step 4: Replace "buy me a coffee" footer link (~line 1915)

Find:
```html
        <div class="footer-line"><a class="footer-coffee" href="https://buymeacoffee.com/eevs">If you like this and want to support it, please buy me a coffee! ☕️
</a></div>
```

Replace with:
```html
        <div class="footer-line">
          <button class="upgrade-pro-btn" type="button" data-open-pro-modal>Upgrade to ★ Pro</button>
        </div>
```

### Step 5: Verify in browser
- Open `free.html`
- Footer should show "Upgrade to ★ Pro" button
- Clicking it opens the modal
- Escape key and clicking outside close the modal
- "Start Free Trial →" link goes to `PLACEHOLDER_LS_CHECKOUT_URL` (broken until Task 12)

### Step 6: Commit
```bash
git add free.html
git commit -m "feat(free): add pro upgrade modal, badge styles, and Upgrade CTA"
```

---

## Task 4: Gate "Rows start with note" — Pro only

The entire `rowStartSelect` feature disappears in free tier. Replace with a grayed-out ★ Pro placeholder. Stub the JS DOM reference to `null` so all `if (rowStartSelect)` guards no-op gracefully.

### Step 1: Replace HTML option-field (~line 2027)

Find:
```html
        <div class="option-field">
          <div class="opt-label-row">
            <label class="opt-label" for="rowStartSelect">Rows start with note</label>
            <button class="info-btn" type="button" data-info-key="rowStart" aria-label="Learn about row start">i</button>
          </div>
          <div class="opt-control">
            <select id="rowStartSelect"></select>
          </div>
        </div>
```

Replace with:
```html
        <div class="option-field">
          <div class="opt-label-row">
            <label class="opt-label">Rows start with note</label>
            <span class="pro-badge">★ Pro</span>
          </div>
          <div class="opt-control">
            <select class="pro-gated-btn" disabled aria-hidden="true">
              <option>C (Pro only)</option>
            </select>
          </div>
        </div>
```

### Step 2: Stub rowStartSelect JS reference (~line 2455)

Find:
```javascript
  const rowStartSelect = document.getElementById("rowStartSelect");
```

Replace with:
```javascript
  const rowStartSelect = null; // Pro feature — removed in free tier
```

All downstream uses of `rowStartSelect` are guarded by `if (rowStartSelect)` or `if (!rowStartSelect) return;` so they will no-op safely.

### Step 3: Verify in browser
- Options panel → "Rows start with note" shows grayed-out selector with ★ Pro badge
- Clicking ★ Pro badge opens upgrade modal
- App functions normally (grid rows default to C)

### Step 4: Commit
```bash
git add free.html
git commit -m "feat(free): gate 'Rows start with note' — Pro only"
```

---

## Task 5: Gate "Hard Mode" — remove from sensitivitySelect + delete HARD_* constants

### Step 1: Remove Hard option from sensitivitySelect HTML (~line 1999)

Find:
```html
            <select id="sensitivitySelect">
              <option value="relaxed">Relaxed (Vocal - forgiving)</option>
              <option value="medium" selected>Medium (medium response)</option>
              <option value="hard">Hard (small dead zone, fast response)</option>
            </select>
```

Replace with:
```html
            <select id="sensitivitySelect">
              <option value="relaxed">Relaxed (Vocal - forgiving)</option>
              <option value="medium" selected>Medium (medium response)</option>
            </select>
            <span class="pro-badge">★ Pro</span>
```

### Step 2: Delete HARD_* constants (~lines 2665–2669)

Find:
```javascript
  // Hard mode softened but still tighter than Medium
  const HARD_DEADZONE_RATIO = MEDIUM_DEADZONE_RATIO / 2; // ~0.12%
  const HARD_MIN_HOLD_MS = 40;
  const HARD_ERR_SCALE = 0.9;
  const HARD_NEEDLE_TAU_MS = 30;
```

Replace with:
```javascript
  // Hard mode is Pro-only — HARD_* constants removed in free tier
```

### Step 3: Update sensitivity validation in applySettingsToUI (~line 3799)

Find:
```javascript
    const validModes = new Set(["relaxed","medium","hard"]);
    const sensitivityVal = validModes.has(originalSensitivity) ? originalSensitivity : "medium";
```

Replace with:
```javascript
    const validModes = new Set(["relaxed","medium"]); // "hard" is Pro-only
    const sensitivityVal = validModes.has(originalSensitivity) ? originalSensitivity : "medium";
```

### Step 4: Verify in browser
- Options → Mode shows only Relaxed and Medium + ★ Pro badge
- If localStorage contained `sensitivity: "hard"`, it normalizes to "medium" on load
- App behaves correctly in Medium mode

### Step 5: Commit
```bash
git add free.html
git commit -m "feat(free): gate Hard mode — remove HARD_* constants, restrict sensitivity options"
```

---

## Task 6: Gate "Stretch Tuning" — remove Medium/Full options + rewrite stretch functions

**Context:** `interpolateRailsbackCents` uses `RAILSBACK_ANCHORS` for full Railsback interpolation. In the free tier, "minimal" mode only needs the above-A4 portion of the curve. We remove `RAILSBACK_ANCHORS` and `interpolateRailsbackCents` entirely, replacing `getStretchCents` with a self-contained minimal-only implementation.

### Step 1: Remove Medium and Full options from stretchSelect (~line 2043)

Find:
```html
            <select id="stretchSelect">
              <option value="none">None (Equal Temperament)</option>
              <option value="minimal" selected>Minimal (¼ Railsback above A4)</option>
              <option value="medium">Medium (½ Railsback above A4)</option>
              <option value="full">Full (Railsback)</option>
            </select>
```

Replace with:
```html
            <select id="stretchSelect">
              <option value="none">None (Equal Temperament)</option>
              <option value="minimal" selected>Minimal (¼ Railsback above A4)</option>
            </select>
            <span class="pro-badge">★ Pro</span>
```

### Step 2: Remove RAILSBACK_ANCHORS constant (~lines 2672–2682)

The array starts at line 2672 with `const RAILSBACK_ANCHORS = [` and ends with `];` a few lines later (9 anchor entries + closing bracket). Find and replace the entire block:

```javascript
  // Average grand-piano Railsback curve (midi vs cents relative to equal temperament)
  const RAILSBACK_ANCHORS = [
    { midi: 21, cents: -40 },  // A0
    { midi: 33, cents: -25 },  // A1
    { midi: 45, cents: -10 },  // A2
    { midi: 57, cents: -4 },   // A3
    { midi: 69, cents: 0 },    // A4
    { midi: 81, cents: 6 },    // A5
    { midi: 93, cents: 15 },   // A6
    { midi: 105, cents: 28 },  // A7
    { midi: 108, cents: 35 }   // C8
  ];
```

Replace with:
```javascript
  // RAILSBACK_ANCHORS removed — Medium/Full stretch is Pro-only
```

### Step 3: Replace interpolateRailsbackCents + getStretchCents (~lines 3978–4053)

Find the entire `interpolateRailsbackCents` function followed by `getStretchCents`. They span from `function interpolateRailsbackCents(midi)` through the closing `}` of `getStretchCents` (around line 4053).

Replace the entire range (both functions) with:

```javascript
  function getStretchCents(midi) {
    // Free tier: only "none" and "minimal" modes available
    if (!stretchSelect) return 0;
    const mode = stretchSelect.value || "none";
    if (mode === "minimal" && midi >= 69) {
      // ¼ Railsback-style above A4: monotone cubic fit to above-A4 anchors
      // Anchors: A4=0¢, A5=6¢, A6=15¢, A7=28¢, C8=35¢ (×0.25 for minimal)
      const A = [69, 81, 93, 105, 108];
      const C = [0, 1.5, 3.75, 7, 8.75]; // original cents × 0.25
      if (midi >= A[A.length - 1]) return C[C.length - 1];
      for (let i = 0; i < A.length - 1; i++) {
        if (midi >= A[i] && midi <= A[i + 1]) {
          const t = (midi - A[i]) / (A[i + 1] - A[i]);
          return C[i] + t * (C[i + 1] - C[i]); // linear segment
        }
      }
    }
    return 0;
  }
```

Note: This is a linear interpolation between the 5 above-A4 anchor points, which is a close enough approximation to the full PCHIP for the minimal (¼ scale) curve. The pitch correction at C8 is only ~8.75¢.

### Step 4: Update stretch normalization in applySettingsToUI (~line 3810)

Find:
```javascript
    const stretchVal = (originalStretch === "minimal" || originalStretch === "medium" || originalStretch === "full") ? originalStretch : "none";
```

Replace with:
```javascript
    const stretchVal = (originalStretch === "minimal") ? "minimal" : "none"; // medium/full are Pro-only
```

### Step 5: Verify in browser
- Options → Stretch Tuning shows only None + Minimal with ★ Pro badge
- Play notes above A4 with Minimal selected — pitch detection still works (slight sharpening above A4)
- If localStorage had `stretch: "full"`, normalizes to "none" on load

### Step 6: Commit
```bash
git add free.html
git commit -m "feat(free): gate stretch tuning — remove RAILSBACK_ANCHORS, simplified minimal-only getStretchCents"
```

---

## Task 7: Gate "Performance Pitch" — restrict A4 presets to 440/441/442

### Step 1: Replace aRefSelect options (~lines 1973–1987)

Find the entire `<select id="aRefSelect">` block (options 392 through 470 + custom):
```html
              <select id="aRefSelect" aria-labelledby="presetLabel">
                <option value="392">392</option>
                <option value="415">415</option>
                <option value="430">430</option>
                <option value="432">432</option>
                <option value="438">438</option>
                <option value="440" selected>440</option>
                <option value="441">441</option>
                <option value="442">442</option>
                <option value="443">443</option>
                <option value="444">444</option>
                <option value="466">466</option>
                <option value="470">470</option>
                <option value="custom">Custom</option>
              </select>
```

Replace with:
```html
              <select id="aRefSelect" aria-labelledby="presetLabel">
                <option value="440" selected>440</option>
                <option value="441">441</option>
                <option value="442">442</option>
              </select>
              <span class="pro-badge">★ Pro</span>
```

### Step 2: Hide/disable the custom A4 input (~line 1959)

Find the `<input id="aRefInput" ...>` block. Add `style="display:none"` and `disabled`:
```html
            <input
              id="aRefInput"
              class="a-ref-input"
              type="number"
              min="100"
              max="1000"
              step="1"
              inputmode="decimal"
              aria-label="Custom performance pitch in Hz"
              placeholder="Custom Hz"
              value="440"
              style="display:none"
              disabled
            />
```

### Step 3: Restrict A_REF_PRESET_VALUES constant (~line 3058)

Find:
```javascript
  const A_REF_PRESET_VALUES = Object.freeze(["392","415","430","432","438","440","441","442","443","444","466","470"]);
```

Replace with:
```javascript
  const A_REF_PRESET_VALUES = Object.freeze(["440","441","442"]); // Free tier — full range is Pro
```

### Step 4: Clamp A4 normalization in applySettingsToUI (~line 3789)

Find:
```javascript
    const normalizedA4 = Number.isFinite(a4ValRaw) ? a4ValRaw : DEFAULT_SETTINGS.a4;
    syncARefControls(normalizedA4);
    clearARefError();
    if (!Number.isFinite(a4ValRaw) || normalizedA4 !== a4ValRaw) {
      needsPersist = true;
    }
    currentSettings.a4 = normalizedA4;
```

Replace with:
```javascript
    const FREE_A4_ALLOWED = new Set([440, 441, 442]);
    const a4Num = Number(a4ValRaw);
    const normalizedA4 = FREE_A4_ALLOWED.has(a4Num) ? a4Num : 440; // clamp to free presets
    syncARefControls(normalizedA4);
    clearARefError();
    if (normalizedA4 !== a4ValRaw) {
      needsPersist = true;
    }
    currentSettings.a4 = normalizedA4;
```

### Step 5: Verify in browser
- Options → Performance Pitch shows only 440/441/442 with ★ Pro badge; custom input hidden
- If localStorage had `a4: 432`, normalizes to 440 on load

### Step 6: Commit
```bash
git add free.html
git commit -m "feat(free): gate A4 presets — restrict to 440/441/442, hide custom input"
```

---

## Task 8: Gate "Transposition" — restrict to Concert C only

### Step 1: Replace transpositionSelect options (~lines 2071–2095)

Find the entire `<select id="transpositionSelect">` block (all 23 options from value="11" down to value="-11"):
```html
            <select id="transpositionSelect">
              <option value="11">B (+11)</option>
              ...22 more options...
              <option value="-11">B (−11)</option>
            </select>
```

Replace with:
```html
            <select id="transpositionSelect">
              <option value="0" selected>C (+0) Concert (Flute, Oboe, Violin, Voice, etc.)</option>
            </select>
            <span class="pro-badge">★ Pro</span>
```

### Step 2: Verify normalization works (no JS change needed)

The existing `applySettingsToUI` code at ~line 3885 already handles this:
```javascript
    if (!transpositionSelect || !transpositionSelect.querySelector(`option[value="${transposeVal}"]`)) {
      transposeVal = DEFAULT_SETTINGS.transposition; // → "0"
    }
```
Since only `value="0"` exists in the free select, any non-zero transposition from localStorage normalizes to "0" automatically. No JS change needed.

### Step 3: Verify in browser
- Options → Transposition shows only "C" with ★ Pro badge
- If localStorage had `transposition: "-2"` (Bb trumpet), normalizes to 0 (Concert C) on load

### Step 4: Commit
```bash
git add free.html
git commit -m "feat(free): gate transposition — restrict to Concert C, all keys are Pro"
```

---

## Task 9: Gate "History" — remove Long and Unlimited options

### Step 1: Remove Long and Unlimited from historySelect (~lines 2105–2110)

Find:
```html
            <select id="historySelect">
              <option value="short" selected>Short (1 second)</option>
              <option value="medium">Medium (3 seconds)</option>
              <option value="long">Long (30 seconds)</option>
              <option value="unlimited">Unlimited</option>
            </select>
```

Replace with:
```html
            <select id="historySelect">
              <option value="short" selected>Short (1 second)</option>
              <option value="medium">Medium (3 seconds)</option>
            </select>
            <span class="pro-badge">★ Pro</span>
```

### Step 2: Trim HISTORY_WINDOWS constant (~lines 3016–3021)

Find:
```javascript
  const HISTORY_WINDOWS = Object.freeze({
    short: 1,
    medium: 3,
    long: 30,
    unlimited: Infinity
  });
```

Replace with:
```javascript
  const HISTORY_WINDOWS = Object.freeze({
    short: 1,
    medium: 3,
    // long and unlimited are Pro-only
  });
```

The `HISTORY_KEYS` on the next line (`const HISTORY_KEYS = Object.keys(HISTORY_WINDOWS)`) will now only contain `["short", "medium"]`, so the existing normalization in `applySettingsToUI` at ~line 3817:
```javascript
    const historyVal = HISTORY_KEYS.includes(originalHistory) ? originalHistory : HISTORY_DEFAULT;
```
...will normalize "long" or "unlimited" → HISTORY_DEFAULT ("short"). No further changes needed.

### Step 3: Verify in browser
- Options → History shows Short + Medium with ★ Pro badge
- If localStorage had `history: "unlimited"`, normalizes to "short" on load

### Step 4: Commit
```bash
git add free.html
git commit -m "feat(free): gate history — remove long/unlimited options (Pro only)"
```

---

## Task 10: Gate "Color Hold" — lock to 30s static display

Free tier gets exactly 30 seconds, no dropdown. Keep a hidden `<select id="stainHoldSelect">` with only the 30s option so existing JS references continue working without changes.

### Step 1: Replace stainHoldSelect option-field (~lines 2114–2129)

Find:
```html
        <div class="option-field">
          <div class="opt-label-row">
            <label id="stainHoldLabel" class="opt-label" for="stainHoldSelect">Color Hold Before Fade</label>
            <button class="info-btn" type="button" data-info-key="stainHold" aria-label="Learn about Color Hold Before Fade">i</button>
          </div>
          <div class="opt-control">
            <select id="stainHoldSelect">
              <option value="5">5 seconds</option>
              <option value="15">15 seconds</option>
              <option value="30" selected>30 seconds</option>
              <option value="120">2 minutes</option>
              <option value="300">5 minutes</option>
              <option value="unlimited">No fade</option>
            </select>
          </div>
        </div>
```

Replace with:
```html
        <div class="option-field">
          <div class="opt-label-row">
            <label id="stainHoldLabel" class="opt-label">Color Hold Before Fade</label>
            <span class="pro-badge">★ Pro</span>
          </div>
          <div class="opt-control">
            <span style="color:#94a3b8; font-size:0.9rem;">30 seconds</span>
            <!-- Hidden select keeps JS working; always returns "30" -->
            <select id="stainHoldSelect" style="display:none" aria-hidden="true">
              <option value="30" selected>30 seconds</option>
            </select>
          </div>
        </div>
```

### Step 2: Trim STAIN_HOLD_SECONDS constant (~lines 3023–3031)

Find:
```javascript
  const STAIN_HOLD_DEFAULT = "30";
  const STAIN_HOLD_SECONDS = Object.freeze({
    "5": 5,
    "15": 15,
    "30": 30,
    "120": 120,
    "300": 300,
    "unlimited": Infinity
  });
```

Replace with:
```javascript
  const STAIN_HOLD_DEFAULT = "30";
  const STAIN_HOLD_SECONDS = Object.freeze({
    "30": 30, // Free tier: 30s only — other durations are Pro
  });
```

The normalization in `applySettingsToUI` at ~line 3823 reads:
```javascript
    const stainHoldVal = STAIN_HOLD_SECONDS[originalStainHold] ? originalStainHold : STAIN_HOLD_DEFAULT;
```
With only `"30"` in the map, any other value normalizes to "30". No further changes needed.

### Step 3: Verify in browser
- Options → Color Hold shows "30 seconds" (static text) with ★ Pro badge
- Fade behavior works correctly at 30s

### Step 4: Commit
```bash
git add free.html
git commit -m "feat(free): gate color hold — lock to 30s fixed, full options are Pro"
```

---

## Task 11: Fill in the Lemon Squeezy checkout URL

### Step 1: Get your LS checkout URL
Log in to app.lemonsqueezy.com → your Tonemap Pro product → "Share" or "Buy" link.
It will look like: `https://tonemap.lemonsqueezy.com/buy/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### Step 2: Replace placeholder in free.html

Find:
```html
      <a id="proModalCTA" class="pro-modal-btn" href="PLACEHOLDER_LS_CHECKOUT_URL" target="_blank" rel="noreferrer">
```

Replace `PLACEHOLDER_LS_CHECKOUT_URL` with your actual URL.

### Step 3: Verify the button navigates to LS checkout (new tab)

### Step 4: Commit
```bash
git add free.html
git commit -m "feat(free): add real LS checkout URL to upgrade modal"
```

---

## Task 12: Configure Lemon Squeezy post-purchase redirect

### Step 1: Log in to app.lemonsqueezy.com → your Tonemap Pro product

### Step 2: Find the post-purchase redirect setting
Look for "Confirmation page", "Receipt redirect", or "Success redirect" in the product settings.

### Step 3: Set redirect URL to:
```
https://tonemap.live/activate?key={license_key}
```
Use `{license_key}` exactly (curly braces) — this is LS's template variable for the purchased license key.

The Worker's activation page (`/activate?key=...`) reads the `key` query param and auto-submits the form, setting the HMAC cookie and redirecting to `/pro`.

### Step 4: Test with a real or test purchase to confirm the redirect works end-to-end

---

## Task 13: Wire Worker routes to tonemap.live in `wrangler.toml`

**⚠️ xattr warning:** Edit `wrangler.toml` from your terminal, not via Claude Code's Edit tool.

### Step 1: Add routes to wrangler.toml from your terminal

```bash
cd "/Users/jeremyblack/Documents/App Dev/Tonemap files/tonemap.live"
python3 -c "
content = open('worker/wrangler.toml').read()
routes = '''
[[routes]]
pattern = \"tonemap.live/activate\"
zone_name = \"tonemap.live\"

[[routes]]
pattern = \"tonemap.live/pro\"
zone_name = \"tonemap.live\"
'''
open('worker/wrangler.toml', 'w').write(content + routes)
print('Routes added to wrangler.toml')
"
```

Verify the file looks correct:
```bash
cat worker/wrangler.toml
```

### Step 2: Deploy from your terminal

```bash
cd "/Users/jeremyblack/Documents/App Dev/Tonemap files/tonemap.live/worker"
wrangler deploy
```

### Step 3: Verify routes are live

```bash
# Should return 200 with activation HTML
curl -si https://tonemap.live/activate | head -5

# Should return 302 → /activate (no cookie)
curl -si https://tonemap.live/pro | head -5
```

### Step 4: Commit

```bash
git add worker/wrangler.toml
git commit -m "feat: wire worker routes to tonemap.live/activate and /pro"
```

---

## Task 14: Swap `free.html` → `index.html` (production deployment)

Do this only after `free.html` is fully tested and working end-to-end.

### Step 1: Archive the current index.html

```bash
cd "/Users/jeremyblack/Documents/App Dev/Tonemap files/tonemap.live"
cp index.html index-v1.3-pre-pro.html
git add index-v1.3-pre-pro.html
git commit -m "chore: archive pre-pro index.html (v1.3)"
```

### Step 2: Replace index.html with free.html

```bash
cp free.html index.html
git add index.html
git commit -m "feat: deploy free tier as production index.html"
```

### Step 3: Push and watch Cloudflare Pages deploy

```bash
git push origin main
```

Wait for Pages deployment (~1 min), then verify tonemap.live loads with gated Pro features.

---

## Task 15: End-to-end test

### Free tier (tonemap.live)
- [ ] Hard Mode absent from Options → Mode dropdown; ★ Pro badge present
- [ ] Rows start with note shows grayed-out Pro placeholder
- [ ] Stretch Tuning shows None + Minimal only; ★ Pro badge present
- [ ] A4 presets show only 440/441/442; custom input hidden; ★ Pro badge present
- [ ] Transposition shows C only; ★ Pro badge present
- [ ] History shows Short + Medium only; ★ Pro badge present
- [ ] Color Hold shows "30 seconds" static; ★ Pro badge present
- [ ] "Upgrade to ★ Pro" button in footer opens modal
- [ ] Clicking any ★ Pro badge opens upgrade modal
- [ ] Modal shows free trial info, "Start Free Trial →" link, "Already purchased?" link
- [ ] Escape / click-outside / ✕ button closes modal
- [ ] Relaxed + Medium modes work correctly
- [ ] None + Minimal stretch works correctly
- [ ] Short + Medium history works correctly
- [ ] Color hold fades at 30s correctly

### Activation flow
- [ ] Click "Start Free Trial →" → LS checkout page opens in new tab
- [ ] Complete trial signup (or use test key) → redirects to tonemap.live/activate?key=...
- [ ] Activation page auto-submits the key
- [ ] 302 redirect to tonemap.live/pro → full Pro HTML served from KV

### Direct activation
- [ ] Visit tonemap.live/activate manually
- [ ] Enter valid license key → redirected to /pro

### Pro tier (/pro)
- [ ] All Pro features visible and functional
- [ ] Hard Mode available in sensitivity select
- [ ] All transpositions available
- [ ] Full A4 range + custom input
- [ ] Long + Unlimited history options
- [ ] Full Color Hold options
- [ ] Rows start with any note works
- [ ] Full Railsback stretch options work

### Cookie handling
- [ ] Manually delete `tm_pro` cookie → visiting /pro redirects to /activate
- [ ] Re-activate → cookie restored, /pro accessible again

---

## Notes for Future Updates

### Updating Pro KV content
When `test.html` is updated with new Pro features, re-upload:
```bash
cd "/Users/jeremyblack/Documents/App Dev/Tonemap files/tonemap.live/worker"
wrangler kv key put --remote --namespace-id=25916307ce9d4005b0998afe806127e2 "pro-app.html" --path="../test.html"
```

### HMAC secret
Production secret is set via `wrangler secret put HMAC_SECRET`. Dev secret is in `worker/.dev.vars` (gitignored). Never commit the production secret.

### Lemon Squeezy template variable
When configuring the LS redirect URL, use `{license_key}` (LS's variable). The Worker reads the `key` query parameter from the URL.
