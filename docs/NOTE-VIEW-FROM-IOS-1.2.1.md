# Note View: what iOS 1.2.1 changed, and what fits the web

Written 2026-10-19 from a read of this repo (main @ bd19db1) against the iOS
1.2.1 work (tonemap-ios `docs/RELEASE-1.2.1.md` #37). The goal is to decide on
the web's own merits — not to copy iOS. Line numbers are `index.html` @
bd19db1; `beta.html` has the same Note View code; `beta-451.html` (Pro) the
same logic at other lines, minus the free-build scroll gate (see 5).

**Which files.** `beta.html` is being retired at the end of October 2026
(CLAUDE.md), so changes here belong in `index.html` (free, production —
finished and tested work only) and `beta-451.html` (Pro / KV, ported
explicitly); `beta.html` only if it's still live when the work lands.

## The big difference

**On the web you can't scroll back while the mic runs.** The scroll handler
pins `scrollLeft` to the end when `running` (10586–10597), wheel/touchmove
`preventDefault` while running (10642, 10671), `scrollNoteViewBy` returns if
running (12948), and `renderNoteView` forces live (11273–11275). You pause,
then review. iOS and Android work the other way: the mic is always on, so
history is reviewed while recording continues — that is where most of the iOS
problems came from.

**Decide first:** keep "pause to review" on the web, or allow scrolling while
playing like the apps? Most of what follows depends on it.

## Summary

| iOS change | Problem present on the web? | Recommendation |
|---|---|---|
| 1. Scroll anchored to a note | **No** — nothing changes while paused | Not needed (needed if 1 above becomes "scroll while playing") |
| 2. Retention by what Note View shows | Noise doesn't expire history here, but **retention is tied to grid colour settings and pruned per cell** (bug) | Adapt |
| 3. No note cap | 900 cap; rarely binds at current retention | Revisit with 2 |
| 4. Incremental note building | Merge runs per note event, fine; **ribbons are O(notes × segments) every frame** | Adapt (ribbons first) |
| 5. Position bar, "N min ago", Live | None; free builds block scroll-back with wheel/← | Adapt; clean up the free-build gate |

## 1. Scroll drift — not present

Note View is a native scrolling `div` (`.note-view-container`, 498) with a
spacer the width of the timeline; a sticky canvas redraws from `scrollLeft`
(11168). While paused nothing is added or pruned (pruning only happens in
`finalizeActiveSegment`, 10520), so the content can't shift under a
scrolled-back view. `noteViewScrollRatioByStyle` (6788) only re-maps the
position when switching balloons ↔ ribbons while paused (approximate, since
the styles lay out differently). **If** scrolling while playing is ever
allowed, anchor to a note as iOS does.

## 2. Retention — a different problem than iOS

**What the web does.** `getSegmentRetentionMs` (10391) = max(History, Color
Hold) + 5 s, ceiling 10 min. History is 1 / 3 / 30 s or Unlimited, so at
default settings (History 3 s, Color Hold 30 s) **Note View keeps ~35 s**;
only Unlimited reaches 10 min. `pruneCellSegments` (10402) cuts by **wall
clock** (`nowMs()` − retention), and caps each cell at 2000 segments.

The active clock behaves like iOS's did (any valid, loud-enough frame
advances it and resets the 3 s silence allowance; 12077–12080, 12168–12176),
but here it only drives layout (`startActiveMs`), so noise can't expire
history. iOS's fix for that isn't needed.

**Bug.** Pruning only runs for the cell that just received a segment (10520).
A pitch you don't play again keeps its old segments; pitches you replay lose
everything older than retention. At default settings Note View shows a
lopsided mix — recent repeated notes gone, stale one-off notes still there —
with the holes hidden by capped rest gaps.

**Suggested.** One Note View retention, separate from the grid's History /
Color Hold (which only shape cell colour), applied to all notes at once. iOS
uses "20 min of what Note View shows" (note durations + rests, each rest ≤ 3 s;
`_nvRetain` in tonemap-ios `Tonemap/NoteStateStore.swift`). Keep per-cell
pruning for the grid's colour.

**Decide:** how much history the web should keep (20 min like the apps? less
for the free build?), and whether that's tied to "pause to review".

## 3. The 900-note cap

`NOTE_VIEW_MAX_BALLOONS = 900` (6744), spliced at the end of
`collectMergedNoteSegments` (7003). Merge: consecutive same-MIDI segments
within 150 ms; merged notes < 25 ms dropped (10432). 900 notes ≈ 2 min of fast
passagework (8/s), 5–7 min at 2–3/s. Today the 35 s / 10 min retention binds
first, so the cap only matters on Unlimited. **Raise or remove it together
with 2**, with a backstop above the gate maximum (rAF detection: one reading
per display frame, 60–120/s, so the per-20-min maximum is higher than the
apps' ~26–28 000 on 120 Hz screens — work it out before choosing a number).

## 4. Per-frame cost — ribbons are the hot spot

- Detection: one `findPitch` per `requestAnimationFrame` (`tick()`, 11986),
  2048-sample overlapping window (12264). Segments are stored per note event,
  not per reading.
- `collectMergedNoteSegments` (6913) runs only when `dataDirty` (each note
  change) — collects and sorts every segment of every cell. Per note event,
  not per frame: acceptable now, grows with longer retention.
- **Every frame**, `renderRibbonsNotes` (10788) loops over **all** merged
  notes with no viewport skip, and for each scans, copies and sorts every
  segment in that pitch's cell; while a note sounds, `calculateRibbonsLayout`
  (10735) repeats the scan (11096). O(notes × segments per cell) per frame —
  the first thing to fix before keeping longer history.

**Suggested.** Cache each ribbon note's sub-segments when it's merged; cache
layout; draw only notes in the visible window. Then an incremental merge (iOS:
fold once, re-merge only the tail) if retention grows.

## 5. Scrolled-back controls, and the free-build gate

**What the web has.** The native horizontal scrollbar (unstyled; an overlay
that hides on macOS). Back to live: scroll within 16 px of the right edge
(10624–10626), → key (90 / 240 px with Shift; 13112–13121), or start the mic.
No time label, no Live button; `startMs` is `performance.now()` (page-relative),
so no wall time is stored.

**Leftover Pro gate.** In the free builds, `blockNoteViewFreeScroll` (12943)
always returns `true`, blocking scroll-back by wheel and ←; touch swipe and
scrollbar drag still work, and the upsell is a stub. The entry notice says
"Pause the mic to scroll through your Note View history. Full history is
available in Pro." (`index.html` 12748, `beta.html` 12755). CLAUDE.md says
Note View is free for everyone — so this contradicts the product decision
and should go, whichever way the rest is decided. `getNoteViewFreeScrollMinLeft`
is unused.

**Suggested (once scroll-back works everywhere).** A Live button and an
"N min ago" label are worth it; store `Date.now()` per segment for the label.
A custom position bar matters less where the native scrollbar shows (Windows,
touch), more on macOS where it hides.

## Other findings (not from iOS)

- **Probable repaint bug** (check in a browser): in the scroll handler a
  user-initiated scroll returns early (10611–10616) before `renderNoteView()`;
  while paused nothing else repaints, so keyboard/wheel/touch scrolling may
  not redraw the canvas until the 220–420 ms input window ends, and those
  scrolls don't save the scroll ratio or set `isLive = false`.
- **Ribbons never draw the sounding note** — the preview widens the timeline
  (11096–11102) but isn't passed to `renderRibbonsNotes`, so a blank grows at
  the right until the note ends (balloons do draw it, 11108–11121).
- Rest gaps: 20 ms/px; balloons cap at `balloonRadius × 4`, ribbons at 4000 ms
  = 200 px (10759) though comments say "up to 2 seconds". The balloon preview
  has no rest gap, so it jumps right when finalized.
- `getNoteViewThemeStyles` calls `getComputedStyle` every frame (11185).

## Suggested order

1. Remove the free-build scroll gate and the "Full history … Pro" text.
2. Check (and fix) the repaint early-return; draw the sounding ribbon.
3. Decide "pause to review" vs scroll-while-playing, and the retention length.
4. Retention separated from grid colour, applied to all notes (fixes the
   per-cell bug).
5. Ribbon caching + visible-window drawing; then raise/remove the 900 cap.
6. Live button + "N min ago".
7. Note anchoring only if scroll-while-playing is adopted.
