# Free/Pro Working Plan (Simplified Architecture)

Date: 2026-03-06
Status: **HISTORICAL** — see note below
Owner: Jeremy + AI assistant

> **⚠️ HISTORICAL — DO NOT FOLLOW STEP-BY-STEP.** This plan executed the original split (with transposition, stretch, and rowStart gated). After launch the split was **deliberately simplified** to give free users a cleaner experience. The currently gated set is: sensitivity (Hard), A4 (non-440/441/442), history (Long/Unlimited), Color Hold (non-30s), and the Quick Recorder. Transposition, Stretch Tuning, and "Rows start with" are now **free for everyone**. See `CLAUDE.md` for the live matrix.

## Purpose
Execute the free/pro split with the simplest viable architecture:
- Public app: `index.html` (rebuilt from current `test.html` as free tier)
- Pro app: `pro-app.html` (stored in KV, served only behind Worker auth at `/pro`)
- Upgrade/auth UX: handled with overlays + Worker activation flow (`/activate`)

---

## Phase 0 Decisions (Locked)
1. **Source of truth for rebuild:** `test.html` ✅
2. **Feature split flexibility:** Approved to tweak before launch ✅
3. **Do we need `pro.html`?**
   - **Short answer:** No, not required for app functionality.
   - **Reason:** Worker already protects and serves Pro content via `/pro`; overlays handle upgrade UX in-app.
   - **When to keep it:** Only if you want a separate marketing/SEO landing page.

---

## Current Repo Reality (Important)
- Worker auth flow is implemented and route-wired:
  - `worker/index.js` handles `/activate` and `/pro`.
  - `worker/wrangler.toml` has active routes for `tonemap.live` and `www`.
- `free.html` is currently missing.
- `free-old.html` contains reusable gating/modal logic (legacy).
- `pro.html` exists as an old POC marketing page and is not needed for protected Pro delivery.
- `terms.html` currently links to `/pro.html` and should be updated if `pro.html` is retired.

---

## Target Architecture (Go-Live)
- `/` → static free app (`index.html`) with Pro lock overlays and checkout CTA.
- `/activate` → Worker activation page; accepts `?key={license_key}` and validates with Lemon Squeezy.
- `/pro` → Worker checks signed cookie + revalidation, then serves KV key `pro-app.html`.
- No separate in-app navigation to `pro.html`.

---

## Execution Plan

### Phase 1 — Rebuild Free App from `test.html`
- [ ] Create `free.html` by copying `test.html` (fresh baseline).
- [ ] Port/merge only reusable free/pro gating pieces from `free-old.html`:
  - modal markup/styles,
  - free allowlist guard logic,
  - option-change lock/revert handlers,
  - upgrade CTA + `/activate` fallback link.
- [ ] Keep all recent `test.html` fixes/features intact during merge.
- [ ] Validate free tier controls match intended split.

### Phase 2 — Security Hardening in Free Build
- [ ] Remove Pro-only JS constants/functions from free build (not just hide UI):
  - hard-mode constants/paths,
  - full Railsback anchor/interpolation paths,
  - any dead code enabling Pro behavior via devtools.
- [ ] Verify localStorage/manual value coercion cannot unlock Pro behavior.

### Phase 3 — Pro Payload Path
- [ ] Establish `pro-app.html` as the canonical Pro payload file.
- [ ] Publish `pro-app.html` to KV key `pro-app.html`.
- [ ] Confirm `/pro` serves KV payload only when authenticated.

### Phase 4 — Content/Link Cleanup
- [ ] Decide one of:
  - **A)** Keep `pro.html` as marketing page, or
  - **B)** Retire `pro.html` to reduce complexity.
- [ ] If retiring `pro.html`, update links that reference it (currently in `terms.html`).
- [ ] Keep legal/docs copy aligned with actual routes (`/activate`, `/pro`).

### Phase 5 — E2E Validation + Launch Prep
- [ ] LS checkout redirect template confirmed:
  - `https://tonemap.live/activate?key={license_key}`
- [ ] Test paths:
  - unauthenticated `/pro` → redirects to `/activate`,
  - activation with valid key → cookie set → `/pro` content loads,
  - invalid/expired key behavior,
  - free-tier lock prompts and fallback values.
- [ ] Replace current public `index.html` with approved `free.html`.

---

## `pro.html` Recommendation
Recommended default: **retire `pro.html` now** to keep architecture minimal and avoid split-brain messaging.

Keep it only if you explicitly want a standalone marketing page. If kept, treat it as marketing-only and ensure legal/docs text reflects that `/pro` is the authenticated app route.

---

## Immediate Next Actions (Practical)
1. [ ] Build new `free.html` from `test.html` baseline.
2. [ ] Implement gated feature allowlist and modal hooks in that new file.
3. [ ] Decide and execute `pro.html` disposition (retire or marketing-only).
4. [ ] Update `terms.html` links accordingly.
5. [ ] Run auth + gating E2E checklist before swapping `index.html`.

---

## Notes
- Worker file edits can hit macOS provenance/xattr issues; if Worker files are modified, use terminal recreation workflow before Wrangler deploy.
- Prefer one canonical source per runtime role:
  - free runtime = `index.html`
  - pro runtime payload = `pro-app.html` in KV
  - auth boundary = Worker (`/activate`, `/pro`)
