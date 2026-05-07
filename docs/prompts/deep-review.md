# Deep Review Prompt

Paste this into the Claude VSCode extension when you want a thorough static review.
Optionally append: "Focus on [section/feature]" or paste a specific diff/excerpt after it.

---

You are reviewing code for **Tonemap.live**, a single-file browser app (vanilla JS/HTML/CSS, no build step).
Key facts:
- `beta-451.html` is the active dev file; `index.html` is production (free tier).
- Free-tier enforcement is client-side via `FREE_ALLOWED` / `isProLockedValue()` — Pro gating bugs are a real risk.
- Audio runs on Web Audio API: `AudioContext` → `AnalyserNode` (fftSize 2048) → pitch detection loop at ~60fps.
- The recorder uses the same `analyserNode` for a live spectrum visualizer during recording.
- `currentSettings` is the central state object, persisted to localStorage.
- `cellState[midiNote]` tracks per-note history. `recorderState` tracks recorder/playback state.

Review the code I'm about to share. Work through each category below systematically.
For each finding, state: **location** (function name or line if known), **what the bug/risk is**, and **a concrete fix**.
If a category is clean, say so briefly. Do not pad findings — only report real issues.

**1. Logic and correctness**
Look for: off-by-one errors, wrong conditions, inverted booleans, missed early returns,
incorrect math (especially cents/frequency calculations), state that can get out of sync.

**2. Pro gating holes**
Can a user reach a Pro-locked value via localStorage manipulation, direct DOM changes,
or a code path that bypasses `isProLockedValue()`? Does `applySettingsToUI()` correctly
normalize any out-of-range value loaded from storage back to a free-tier default?

**3. Audio/timing hazards**
Look for: AudioContext started before a user gesture, race conditions between the mic
permission grant and the pitch detection loop starting, `analyserNode` used while null,
rAF loops that can stack (multiple `requestAnimationFrame` calls without canceling the
previous handle), recorder state not reset on a new recording, memory leaks from
unclosed AudioContexts or detached WorkletProcessor nodes.

**4. Edge cases and failure modes**
What happens if: the mic is denied, the page is hidden (visibilitychange), the user
navigates away mid-recording, localStorage is full or corrupted, a setting value is NaN
or undefined? Are error paths handled gracefully or do they throw silently?

**5. Mobile / browser compatibility**
Look for: anything that assumes a desktop sample rate (44100 — mobile Safari often uses
48000), missing `webkit` prefixes that are still needed on iOS, touch events vs pointer
events, viewport / safe-area issues, AudioWorklet fallback if unsupported.

**6. Security and data exposure**
Is any user data (license key, HMAC cookie value, email) logged to the console or
embedded in URLs? Are there XSS risks from unsanitized strings inserted into the DOM?

**7. Dead code and regressions**
Is there unreachable code, commented-out blocks that should be removed, or constants
that are defined but never used? Does anything look like it was copied from `index.html`
but not updated to match `beta-451.html`'s current architecture?

After all categories: give a **priority ranking** — which finding, if any, is the one
most likely to cause a real user-facing bug or a Pro gating failure?
