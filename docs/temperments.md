# Temperaments, Key Center & Transposition — Design Notes for Tonemap

_Compiled September 2026, in response to user requests for Pythagorean, meantone (1/4, 1/3, 1/6-comma), and well temperaments (Werckmeister, Kirnberger, Vallotti, Young, Kellner, Barnes), modeled loosely on TonalEnergy (TE) Tuner's implementation. Scope note: Tonemap's audience has broadened past violinists to other instrument families, so transposition is a first-class concern — see the transposition section._

## The families of "temperament"

**1. Open/regular systems (have a wolf interval): Pythagorean, meantone 1/4-, 1/3-, 1/6-comma.**
Built by stacking a fixed-size fifth (pure 3:2 for Pythagorean; a fifth narrowed by a fraction of the syntonic comma for meantone) around a chain of 12 notes from a reference pitch. The chain doesn't close, so one interval — the "wolf" — absorbs the error and is unusable. The reference pitch determines where the wolf lands (traditionally opposite the reference, e.g. reference C → wolf at G#/Eb).

**2. Circulating well temperaments (no wolf): Werckmeister III/IV/V, Kirnberger III, Vallotti, Young, Kellner, Barnes.**
Every key is playable; semitones are simply unequal, so each key has a characteristic color. Designed for fixed-pitch keyboards tuned once, historically anchored to C, specifically so *all* keys work.

**3. Just intonation — static table (Tonemap's chosen approach) or dynamic.**
TE Tuner tracks a root dynamically via chord/inversion auto-detection. **Tonemap decision (Sept 2026): dynamic auto-sensing is out of scope.** A static table anchored to a user-chosen key center works fine — see below.

## What "Key Center" / "Pitch Center" does, per family

- **Open systems (Pythagorean/meantone):** load-bearing. A genuine transposition of the deviation table that decides where the wolf falls.
- **Circulating well temperaments:** optional. No wolf to relocate; rotating re-centers the key-color pattern.
- **Just (static):** load-bearing and the most user-visible of the three.

## Data model

Every temperament is a 12-element array of cent offsets from ET, indexed by scale degree from its *own* tonic (0 = tonic … 11). TE Tuner's own editor uses exactly this representation — its Edit Temperament screen lists "1 (U), 2 (m2), 3 (M2) …" — so it's a proven shape.

```
temperament.degrees = [0, 11.73, 3.91, ...]   // deviations from ET, not absolute interval cents
centsForPitchClass(pc, temperament, keyCenterPc) =
    temperament.degrees[(pc - keyCenterPc + 12) % 12]
```

Custom is not a special code path — just a temperament whose array is user-editable.

## Reference convention (approved September 14, 2026)

Implemented in `beta.html`, `index.html` and `beta-451.html` (identical engines, proven by `tests/fixture-parity.test.cjs`); the iOS port is pending. Performance Pitch is the **concert A4 reference for the underlying equal-tempered scale**, not a promise that the tempered A4 target has that frequency. The selected pitch center keeps its frequency from that ET scale before stretch; all other degrees use their offsets directly, with no normalization to A.

**Anchor (added September 2026, `beta.html` only so far).** The convention above is the default, `temperamentAnchor: "center"`. The alternative, `"a4"`, holds A4 on the reference instead: every degree is shifted by A's own offset (`degrees[(9 − center) mod 12]`), so A4 = reference exactly and the pitch center drifts by that amount. The shift is one constant per temperament and center, so cell widths and nearest-note assignment are unchanged; only where the lattice sits moves, and history is rescored as for an A4 change. The two anchors coincide when the center is A or under Equal. For reference 441, concert C center, Just major: anchor Pitch Center gives C4 = 262.220 Hz, A4 = 437.034 Hz; anchor A4 gives A4 = 441 Hz, C4 = 264.601 Hz. The Customize Temperaments dialog shows these three frequencies live.

For reference 441 Hz, concert C center, Just major and stretch off:

- C4 = `441 * 2^(-9/12)` = **262.220169 Hz**.
- A4 = `441 * 2^(-15.64/1200)` = **437.033940 Hz** with the stored two-decimal offset.
- Using the exact 5/3 ratio gives **437.033615 Hz**; the difference is table rounding, under 0.005 cents.
- With concert A as pitch center instead, A4 remains 441 Hz before stretch.

Every in-tune note reads zero cents against its own combined target. A zero **temperament offset from ET** is a different concept. Stretch is added separately and can move the pitch center away from ET; disable it when testing unstretched just ratios.

This is Tonemap's chosen convention, not a claim of verified app parity. Tunable's published Just/Pure frequency table keeps A4 at 440 Hz and separately lists C-relative editor offsets. TE's public guide describes root-relative offsets but does not explicitly settle absolute anchoring. The native apps' exact behavior still needs direct comparison.

Custom stores eleven editable offsets in the range -45 to +45 cents and fixes degree zero at zero. The shared normalizer enforces this on every path; settings loading persists corrected values. This preserves at least 10 cents between adjacent unstretched targets.

## Transposition: the layering rule

**Temperament and stretch live in sounding (concert) pitch. Transposition is a display transform applied last.** Intonation is acoustic — beating, pure ratios, wolf intervals all happen in the sounding domain. Get this backwards and targets will be wrong.

```
detected frequency → sounding pitch
  → target = temperamentCents(soundingPitchClass, keyCenter)
             + stretchCents(soundingOctave)
             + a4Calibration
  → deviation computed in sounding pitch
  → ONLY the displayed note name is transposed
```

Concrete consequences:

- **Store transposition as a signed semitone integer, not a pitch class.** Octave-transposing instruments break a pitch-class-only model: B♭ trumpet −2, F horn −7, E♭ alto sax −9, B♭ tenor sax −14, E♭ bari sax −21, bass clarinet −14, guitar/double bass −12, piccolo +12. The octave component matters for the grid's range rail and for stretch, which is register-dependent.
- **Key Center is a pitch class (mod 12); transposition is a signed semitone offset.** Different types — don't collapse them into one variable.
- **Key Center should be expressed in the same terms as the displayed note names.** If a trumpeter sees their written C, then selecting "C" as key center should mean written C, with the app converting internally. Consistency of labeling domain is what prevents confusion.
- **Show both when a transposition is active:** `Key: C (concert B♭)`. Small UI touch, removes an entire class of user confusion.
- **Preferred long-term model: store grid history in sounding pitch and relabel at render time.** The existing beta instead stores written MIDI keys and remaps them by `oldOffset - newOffset` on transposition changes. This implementation retains that model rather than introducing a history-storage migration.

### Current beta implementation

The existing analysis operates on a frequency transposed into written pitch. This is algebraically equivalent to concert-domain temperament calculation when both the note and its pitch center are transformed together:

```
soundingMidi = writtenMidi + transposition
concertCenterPc = (writtenCenterPc + transposition + 12) % 12
degree = (writtenMidi - writtenCenterPc + 12) % 12
targetHz = A4Reference * 2^((soundingMidi - 69)/12)
           * 2^((degrees[degree] + stretchCents(soundingMidi))/1200)
```

Pitch Center controls, the banner and the debug display show both domains when transposition is active, for example `C (concert Bb)`. Changing transposition keeps the selected written key; change the written key as well to retain the same concert key. Stretch always uses sounding MIDI, including when history is rescored.

History segments retain their captured target offsets and errors. Remapping their written MIDI keys preserves the sounding notes, and rescoring compares against the current tuning target. Entries outside the existing master-history range are still dropped. The existing selector remains limited to -11 through +11 semitones; octave-specific instrument presets and a sounding-keyed history migration are not part of this change.

### Verification

Run `node --test tests/temperament.test.cjs` from the repository root. This uses Node's built-in test runner and extracts the actual calculations from the single-file app; no npm installation, bundler or application build step is required. Coverage includes the reference example, all presets and centers, A4 references 100/415/440/441/1000, four stretch modes, nearest-target boundaries, all available transpositions, Custom normalization and history rescoring/remapping. The suite runs against every build (`TONEMAP_TARGETS` to narrow it) and `tests/fixture-parity.test.cjs` checks each against the frozen vectors in `tests/fixtures/`.

Needle rendering and direction handling are deliberately deferred to a separate change.

## Static Just intonation — values and limits

5-limit, tonic-relative. **Verified against TE Tuner's own "Just / Pure" table — exact match on all twelve values**, including the three slots where implementations could differ (M2 = 9/8, m7 = 16/9, tritone = 45/32):

| Degree | Ratio | Cents | Dev. from ET |
|---|---|---|---|
| 1 (U) | 1/1 | 0.00 | 0.00 |
| 2 (m2) | 16/15 | 111.73 | +11.73 |
| 3 (M2) | 9/8 | 203.91 | +3.91 |
| 4 (m3) | 6/5 | 315.64 | +15.64 |
| 5 (M3) | 5/4 | 386.31 | −13.69 |
| 6 (P4) | 4/3 | 498.04 | −1.96 |
| 7 (T) | 45/32 | 590.22 | −9.78 |
| 8 (P5) | 3/2 | 701.96 | +1.96 |
| 9 (m6) | 8/5 | 813.69 | +13.69 |
| 10 (M6) | 5/3 | 884.36 | −15.64 |
| 11 (m7) | 16/9 | 996.09 | −3.91 |
| 12 (M7) | 15/8 | 1088.27 | −11.73 |

**"Harmonic Just / Pure" (TE's term) = septimal just.** Verified from TE's editor: identical to the above except m7 = 7/4 (968.83¢, **−31.17**) and tritone = 7/5 (582.51¢, **−17.49**). "Harmonic Just" is TE's coinage; the standard names are septimal or 7-limit just. Genuinely useful for brass and vocal ensembles tuning dominant sevenths to the natural 7th partial.

**Two tables needed, not one.** A single 12-note just table can't serve both tonic-major and tonic-minor harmony (major wants 3 = 5/4 and 6 = 5/3; minor wants ♭3 = 6/5 and ♭6 = 8/5 as primary consonances). Korg has always shipped Just Major and Just Minor separately. A major/minor toggle inside one Just entry is cleaner than two list items.

**The limitation to surface in help text.** A static just table is exact only for harmonies rooted on or near the key center. In a C-major just table, D = 9/8 (+3.91¢) and A = 5/3 (−15.64¢), so the D–A fifth measures **680.45¢ — 21.5¢ narrow, exactly one syntonic comma.** A player tuning a beautiful D minor chord inside a piece in C is told they're ~21.5¢ sharp on A. Respelling D as 10/9 (−17.60¢) fixes D–A and breaks G–D. No static 12-note table does both — that dilemma *is* the syntonic comma, and it's why dynamic root-sensing exists.

**Mitigation in scope:** make Key Center fast to reach, not buried in a settings menu. With static JI it's a per-passage control. TE's double-tap-on-the-grid gesture is a reasonable model.

## Stretch composes cleanly — orthogonal axis

Cents are logarithmic and additive, so as long as stretch is a function of register rather than pitch class, it sums with the temperament offset (see the transposition formula above). No structural conflict: "which pitch class is sharp/flat" and "how much wider than ET should octaves be" are independent dimensions. The one integration point: whatever decides "in tune" for grid coloring and the needle must compare against the *combined* target, not pure ET.

## Shipping set — ~6 primary + Custom

**Decision (Sept 2026): ship roughly six, plus Custom, and add more on request.** Marginal engineering cost per temperament is essentially zero — twelve numbers in an array — so the real cost is UI weight and decision friction, not code. Expanding later is a data change, not an architecture change.

Candidate primary list: Equal · Just (major/minor toggle) · Pythagorean · 1/4-comma meantone · Vallotti · Werckmeister III (name recognition). Septimal Just is nearly free (two values differ from Just) and matters for brass/vocal.

Deferred to Custom or a "More historical temperaments…" submenu: Werckmeister IV/V, Kirnberger III, Kellner, Barnes, 1/3- and 1/6-comma meantone. Kellner and Barnes are competing scholarly reconstructions of "Bach's" temperament — of real interest to harpsichordists, marginal for most users.

**Audience caveat, correcting earlier advice in this doc's first draft:** the well temperaments were downgraded on the premise of a violin-only audience. If keyboardists, harpsichordists and organists are in scope, they are the *primary* consumers of Werckmeister/Kirnberger/Vallotti, and stretch (piano inharmonicity) becomes genuinely important rather than incidental. Re-weight if that audience grows.

**Differentiation from TE:** the temperaments themselves are historical facts, not TE's IP (Werckmeister published 1691). What would read as copying is surface: TE's idiosyncratic labels — "Harmonic Just / Pure," "Pythagorean Just," "Stretched Perfect 5ths" — are their coinages, not standard musicology. Using correct terminology differentiates for free and is more accurate. Grouping the list by use case rather than chronology also reads as a different product.

**Long-tail escape hatch (later, not v1):** the Scala `.scl` format is the de facto standard for tuning files, with several thousand scales in the public archive. Simple text — description, note count, then cents or ratios. Accepting `.scl` import into Custom would let power users bring any historical temperament themselves. Needs a guard rejecting files that aren't 12 notes per octave, since much of the archive is microtonal.

## UI notes for the "Advanced Tuning" menu

- Showing the 12 live cent values is the strongest part of the design — self-documenting, teaches what a temperament *is*, and makes Custom a natural in-place edit. TE hides these behind an ⓘ button.
- Gray out Key Center for Equal, where it has no effect. (As of September 2026 in `beta.html`, Temperament, Pitch Center, Anchor and Needle Behavior live only in the **Customize Temperaments** dialog — reached from the Show Temperament Bar row in Options or the banner gear — plus the banner pill's quick pulldowns. The dialog's Pitch Center is never disabled, since it also labels the rows; Anchor and Needle Behavior dim under Equal.)
- Decide whether the list displays tonic-relative degrees or absolute pitch names. Absolute is more immediately useful when practicing; tonic-relative is portable across keys and matches the data model. Both columns is defensible.
- Store Custom edits tonic-relative, consistent with everything else.
- Keep per-instrument calibration off this screen. "My G# always reads 12¢ high on this instrument" belongs on the stretch/calibration axis, not the temperament array — mixing them produces baffling results the moment the user changes key.

## Starter cent tables (sourced — verify before hardcoding)

Sources anchor differently (C=0 vs A=0), noted per table. Werckmeister III/IV/V numbering isn't standardized across publishers — pull final values from one canonical source per temperament rather than mixing.

**Pythagorean tuning** (anchor A = 0¢; pure 3:2 fifths)

| C | C#/Db | D | D#/Eb | E | F | F#/Gb | G | G#/Ab | A | A#/Bb | B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| −5.87 | −15.64 | −1.96 | −11.73 | +1.96 | −7.82 | +5.87 | −3.91 | −13.69 | 0.00 | −9.78 | +3.91 |

**Quarter-comma meantone** (anchor C = 0¢; wolf at G#–Eb)

| C | C# | D | Eb | E | F | F# | G | G# | A | Bb | B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.0 | −24.0 | −6.8 | +10.3 | −13.7 | +3.4 | −20.5 | −3.4 | −27.4 | −10.3 | +6.8 | −17.1 |

**Werckmeister III** (anchor C = 0¢; absolute cents, not deviations)

| C | C# | D | D#/Eb | E | F | F# | G | G# | A | Bb | B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.0 | 90.2 | 192.2 | 294.1 | 390.2 | 498.0 | 588.3 | 696.1 | 792.2 | 888.3 | 996.1 | 1092.2 |

**Vallotti** (anchor A = 0¢; six pure fifths B–F#–C#–G#–Eb–Bb–F, six narrowed by 1/6 Pythagorean comma)

| C | C# | D | Eb | E | F | F# | G | G# | A | Bb | B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| +5.9 | 0.0 | +2.0 | +3.9 | −2.0 | +7.8 | −2.0 | +3.9 | +2.0 | 0.0 | +5.9 | −3.9 |

**Kellner's Bach** (anchor A4 = 440 Hz = 0¢)

| C | Db | D | Eb | E | F | Gb | G | Ab | A | Bb | B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| +8.21 | −1.56 | +2.74 | +2.35 | −2.74 | +6.26 | −3.52 | +5.47 | +0.39 | 0.00 | +4.30 | −0.78 |

For Werckmeister IV/V, Kirnberger III, Young, Barnes, and 1/3- and 1/6-comma meantone, tunableapp.com has a page per temperament with sourced tables.

## Sources

- [Werckmeister temperament](https://en.wikipedia.org/wiki/Werckmeister_temperament) · [Vallotti](https://en.wikipedia.org/wiki/Vallotti_temperament) · [Kirnberger](https://en.wikipedia.org/wiki/Kirnberger_temperament) · [Quarter-comma meantone](https://en.wikipedia.org/wiki/Quarter-comma_meantone) — Wikipedia
- [CBH Technical Library — Cent deviations](https://www.hpschd.nu/tech/tun/cents.html)
- [Tunable — Musical Temperaments](https://tunableapp.com/temperaments/) · [vs. Pythagorean](https://tunableapp.com/temperaments/equal-temperament-vs-pythagorean/) · [Kellner's Bach](https://tunableapp.com/temperaments/kellner/)
- [TE Tuner User Guide (iOS)](https://www.tonalenergy.com/tet-user-guide-ios)
- TE Tuner in-app Edit Temperament screens (user screenshots, Sept 2026) — source for the verified Just and Harmonic Just values