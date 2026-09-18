# Temperament Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the temperament engine, the decimal-A4 fix and the other `beta.html` improvements to the free production app (`index.html`) and the Pro build (`beta-451.html`), keeping Hard Mode Pro-gated in production, with a test suite that proves all three builds compute identical tuning targets — and produce the fixture the iOS port will be tested against.

**Architecture:** `beta.html` was forked from `index.html`, so `git diff index.html beta.html` *is* the feature delta and applies to `index.html` with zero conflicts: production becomes a copy of `beta.html` plus eight exact edits that re-lock Hard Mode and strip beta-only page metadata. `beta-451.html` has its own history (recorder, no gate, Hard Mode already present), so it receives the same delta as a filtered patch — Hard-Mode and beta-only hunks dropped — with four rejected hunks and three shared hunks hand-ported at content anchors, plus one function where `beta-451` had fallen behind `index.html`. A shared Node harness extracts the real engine out of each single-file build by regex and runs it in a `vm`; a frozen fixture generated from `beta.html` is the parity oracle for every build, including iOS.

**Tech Stack:** Single-file HTML/CSS/JS, no build, no npm. Node ≥ 20 (`node:test`, `node:vm`; v25 on the dev machine). BSD `patch` (macOS). Python 3 for the two one-off port scripts. Cloudflare Pages + Worker KV for release.

**Spec:** `docs/temperments.md` (the temperament domain design: data model, reference convention, verified tables). Product decisions that shape this plan live in `CLAUDE.md` → *File Roles* and *Feature Parity Matrix*. Every step below was rehearsed on scratch copies on 2026-09-17; the expected outputs quoted are what those rehearsals printed.

## Global Constraints

- **Single-file, no build.** Nothing here adds npm, bundling or separate JS/CSS files to the app. Test files under `tests/` use only Node built-ins.
- **Hard Mode stays Pro-gated in `index.html`.** The gate is `FREE_ALLOWED.sensitivity = Set(["relaxed","medium"])` and `applySettingsToUI()` validating the stored mode against that same set. `beta.html` is deliberately unlocked (`FREE_ALLOWED = Object.freeze({})`) and stays that way. `beta-451.html` is the Pro build and has no gate at all.
- **The Hard Mode *implementation* (`HARD_DEADZONE_RATIO`, `biasHard`, `resolveMode` branch) is allowed to exist in `index.html` behind the gate.** It already exists in `beta-451.html` and iOS; the gate plus validator is the segregation mechanism, and `tests/pro-gate.test.cjs` proves it holds.
- **Two hunks must never reach a served build:** `<meta name="robots" content="noindex, nofollow" />` (would de-index tonemap.live) and `window.APP_VERSION = "2.2"` (beta's number is *behind* production's `2.12`). Production version for this release: **`2.13`** in both `index.html` and `beta-451.html` — Jeremy may pick another number, but both files must match.
- **Quick Record stays Pro-only.** It is gated at its launcher (`data-open-pro-modal`), not through `FREE_ALLOWED`; nothing in this plan touches it.
- **Never edit `worker/index.js` or `worker/wrangler.toml`** (xattr bug, see `CLAUDE.md`). No task here needs to.
- **Suite run time:** the temperament suite takes ~12 s per build (~36 s for three). Budget for it; do not "optimise" the loops.
- **BSD `patch` quirks:** `-F3` is required for four hunks; rejects go to `beta-451.html.rej` with *renumbered* `@@` headers — identify rejects by content, not line number.
- **Commit after every task**, with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as the last line of the message.

---

## Findings the tasks depend on

Facts established by rehearsal on 2026-09-17. An executor does not need to re-derive them, but should not be surprised by them either.

1. **Feature delta:** `git diff --no-index index.html beta.html` = 1,766 insertions / 118 deletions in 86 hunks (`-U3`). By content: temperaments 38 hunks, decimal A4 4, touch-action 1, Hard Mode 12, other 31 (`stretchCents → targetOffsetCents` rename that temperaments rely on, a 128-entry Railsback cache, the new `needleBehavior` setting, select chevrons, shared `overlay-action-btn` classes, A4 input widths, `--needle-target-pos`).
2. **Hunk filtering cannot separate Hard Mode from temperaments** — one "Hard" hunk contains the whole `TEMPERAMENTS` table, another mixes the `modeText` line with the decimal-A4 `skipInput` fix, and `resolveMode`'s `"hard"` line sits in an "other" hunk. Hence: `index.html` gets a **copy + re-lock**, `beta-451.html` gets **filtered patch + hand-ports**.
3. **On `beta-451.html`, the filtered patch (72 hunks) applies with 4 rejects at `-F3`:** the temperament/editor CSS block and the `#temperamentEditor` markup (both lost their anchor because they sat next to Pro-modal/lock CSS `beta-451` lacks), the `normalizedA4` line (`beta-451` uses `Number.isFinite(a4ValRaw) ? a4ValRaw : DEFAULT_SETTINGS.a4`, not `isValidARefValue`), and the `#aRefSelect` width rule (`8.4ch` there, `7.6ch` in index). One fuzzy hunk re-adds `if (modeRaw === "hard") return "hard";` which `beta-451` already had → de-duplicate. `-F2` avoids the duplicate but rejects that whole rename hunk instead; `-F3` + dedupe is the rehearsed path.
4. **`beta-451.html` lags `index.html` in `getStretchCents()`:** it returns 0 when `stretchSelect` is null and never reads `currentSettings.stretch`. The five existing tests cannot see this (they derive expectations from the same engine), the frozen fixture can: 1,080 `stretch=full` rows failed until the function was brought up to date. Only this function and a comment in `computeRailsbackCents` differ across the 25 extracted engine symbols.
5. **A4 anchoring subtlety (matters for iOS):** `getTargetOffsetCents(midi)` already includes the A4 calibration as `1200·log2(a4/440)` measured from the fixed `A4_REFERENCE_HZ = 440` anchor. A target frequency is therefore `equalHz(midi, 440) · 2^(offset/1200)` — anchoring at the user's A4 applies it twice (every 441-Hz row read 3.93 ¢ sharp in the first draft of the generator).
6. **`index.html` has no changes `beta.html` lacks:** its last commit (2026-08-22, App Store badge) is present in `beta.html`; the diff is entirely explained by the features above.
7. **iOS today:** no temperaments (the word appears only in a stretch label); A4 is a `Double` whose text field only re-formats when unfocused (no clobber bug) but the stored value is not rounded to 0.1 Hz (`formatA4` only rounds for display); Hard Mode and Quick Record are gated on `pro.isPro`.
8. **Corrected during execution (Task 4 fix round 1):** the plan's CSS slice ended at `.recording-launcher-shell {`, which precedes the block in beta.html, so it was empty; and beta-451.html has no `.pro-modal-*` rules, which the Custom editor's markup depends on — both blocks are now ported and asserted by selector count.

---

## File Structure

| File | Role in this plan |
|---|---|
| `tests/tuning-harness.cjs` | **New.** Extracts the tuning engine from any build and returns `createTuning`; shared by the suite, the generator and the parity test. |
| `tests/temperament.test.cjs` | **Modified.** Same five tests, now run per build via `TONEMAP_TARGETS` (default all three). |
| `tests/pro-gate.test.cjs` | **New.** Proves Hard Mode is locked in `index.html`, unlocked in `beta.html`, and that production carries no beta metadata. |
| `tests/generate-temperament-vectors.cjs` | **New.** Writes the fixture from a build (default `beta.html`). |
| `tests/fixtures/temperament-vectors.json` | **Generated, committed.** 2,376 end-to-end rows + the nine tables. The iOS oracle. |
| `tests/fixture-parity.test.cjs` | **New.** Every build must reproduce the fixture exactly. |
| `index.html` | Becomes `beta.html` + re-lock + de-beta (Task 3). |
| `beta-451.html` | Receives the filtered delta + hand-ports (Task 4). |
| `CLAUDE.md`, `docs/temperments.md` | Parity matrix cells and the "implemented in" sentence flip as each build lands. |

Task order: **1 harness → 2 fixture → 3 index → 4 beta-451 → 5 release.** The fixture comes before the ports because it is the only test that detects the `getStretchCents` class of divergence.

---

### Task 1: Shared harness and per-build temperament suite

**Files:**
- Create: `tests/tuning-harness.cjs`
- Modify: `tests/temperament.test.cjs` (whole file replaced; the five test bodies are unchanged)

**Interfaces:**
- Consumes: the regex-extractable engine in a build (`  function name(` … `  }` at two-space indent; `  const NAME = …;`).
- Produces: `loadTuning(target) → createTuning(settings?, reference?) → vm context` exposing every extracted function, `A4`, `A4_REFERENCE_HZ`, `currentSettings`, `masterCellState`, `temperaments`; plus `equalHz(midi, reference=440)`, `analyseConcert(tuning, hz)`, `resolveTarget(target)`. `target` is repo-root-relative or absolute. Env `TONEMAP_TARGETS` = comma list, default `index.html,beta.html,beta-451.html`.

- [ ] **Step 1: Create `tests/tuning-harness.cjs`**

```js
// Shared by tests/temperament.test.cjs and tests/generate-temperament-vectors.cjs.
// Pulls the real tuning engine out of a single-file build by regex and runs it
// in a vm context, so the tests exercise the shipped code with no build step.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const functionNames = [
  'computeRailsbackCents', 'interpolateRailsbackCents', 'getStretchCents',
  'getTransposeOffset', 'getA4OffsetCents', 'getTemperamentById',
  'normalizeDegrees', 'getActiveTemperamentDegrees', 'getPitchCenterPc',
  'getTemperamentCents', 'getTargetOffsetCents', 'getLatticeOffsetCents',
  'freqToNoteData', 'rebaseErrRatio', 'getRecentWeightedErr',
  'shiftCellStateBySemitones', 'getPitchCenterLabel'
];
const tableNames = ['TEMPERAMENTS', 'RAILSBACK_ANCHORS'];
const constantNames = [
  'TEMPERAMENT_CUSTOM_ID', 'TEMPERAMENT_EQUAL_DEGREES', 'TEMPERAMENT_CENT_LIMIT',
  'A4_REFERENCE_HZ', 'MASTER_MIDI_MIN', 'MASTER_MIDI_MAX'
];

// Relative targets are repo-root relative; absolute paths are used as-is.
function resolveTarget(target) {
  return path.isAbsolute(target) ? target : path.join(__dirname, '..', target);
}

function extractTuningSource(source, target) {
  const missing = [];
  const pick = (names, regexFor) => names.map(name => {
    const match = source.match(regexFor(name));
    if (!match) missing.push(name);
    return match ? match[0] : '';
  }).join('\n');
  const functions = pick(functionNames, name => new RegExp('^  function ' + name + '\\([^]*?^  }', 'm'));
  const tables = pick(tableNames, name => new RegExp('^  const ' + name + ' = [^]*?^  \\](?:\\))?;', 'm'));
  const constants = pick(constantNames, name => new RegExp('^  const ' + name + ' = .*;', 'm'));
  assert.equal(missing.length, 0, `${target} is missing the tuning engine: ${missing.join(', ')}`);
  return `${constants}\n${tables}\n${functions}`;
}

// Returns createTuning(settings, reference) bound to one build's source.
function loadTuning(target) {
  const source = fs.readFileSync(resolveTarget(target), 'utf8');
  const tuningSource = extractTuningSource(source, target);
  return function createTuning(settings = {}, reference = 440) {
    const context = vm.createContext({
      A4: reference,
      currentSettings: { temperament: 'equal', pitchCenter: '0', stretch: 'none', transposition: '0', ...settings },
      stretchSelect: null,
      transpositionSelect: null,
      accidentalMode: 'flats',
      getNoteNamesForMode: () => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
      getNoteNameForMidi: midi => String(midi),
      masterCellState: {},
      markNoteViewDataDirty() {},
      buildGrid() {},
      recomputeAllCellColorsAndRender() {}
    });
    vm.runInContext(`${tuningSource}
      let a4OffsetCache = { hz: null, cents: 0 };
      let railsbackTableReady = false;
      const railsbackTable = new Float64Array(128);
      globalThis.temperaments = TEMPERAMENTS;
    `, context);
    return context;
  };
}

function equalHz(midi, reference = 440) {
  return reference * 2 ** ((midi - 69) / 12);
}

function analyseConcert(tuning, frequency) {
  return tuning.freqToNoteData(frequency * 2 ** (-tuning.getTransposeOffset() / 12), tuning.A4);
}

module.exports = { loadTuning, resolveTarget, equalHz, analyseConcert };
```

- [ ] **Step 2: Replace `tests/temperament.test.cjs`**

The five `test(...)` blocks are the existing ones, moved inside the per-build `describe`. Full file:

```js
const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { loadTuning, equalHz, analyseConcert } = require('./tuning-harness.cjs');

// Every build that ships the temperament engine. Each gets the same suite,
// run against the code actually in that file. To run one:
//   TONEMAP_TARGETS=beta.html node --test tests/temperament.test.cjs
const TARGETS = (process.env.TONEMAP_TARGETS || 'index.html,beta.html,beta-451.html')
  .split(',').map(s => s.trim()).filter(Boolean);

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

for (const target of TARGETS) {
  describe(`[${target}]`, () => {
    // Extracted once per build, inside a test so a build that lacks the engine
    // fails here with the list of missing names instead of crashing the file.
    let create = null;
    test('source exposes the tuning engine', () => { create = loadTuning(target); });
    const createTuning = (...args) => {
      assert.ok(create, 'tuning engine was not extracted -- see the first test in this block');
      return create(...args);
    };

    test('C-centered Just uses the ET reference for C, not fixed A', () => {
      const tuning = createTuning({ temperament: 'just-major' }, 441);
      const tonic = equalHz(60, 441);
      near(analyseConcert(tuning, tonic).cents, 0);
      const target = analyseConcert(tuning, tonic * 5 / 3);
      assert.equal(target.midi, 69);
      near(target.targetFreq, 437.0339396547029);
      near(target.cents, 0, 0.005);
      near(analyseConcert(tuning, 441).cents, 15.64);
      tuning.currentSettings.pitchCenter = '9';
      near(analyseConcert(tuning, 441).cents, 0);
    });

    test('presets, all keys, references and stretch modes find targets and midpoint boundaries', () => {
      const tuning = createTuning();
      for (const reference of [100, 415, 440, 441, 1000]) {
        tuning.A4 = reference;
        for (const temperament of tuning.temperaments) {
          tuning.currentSettings.temperament = temperament.id;
          for (let center = 0; center < 12; center++) {
            tuning.currentSettings.pitchCenter = String(center);
            near(tuning.getTemperamentCents(60 + center), 0);
            for (const stretch of ['none', 'minimal', 'medium', 'full']) {
              tuning.currentSettings.stretch = stretch;
              for (let midi = 21; midi <= 108; midi++) {
                const degree = ((midi - center) % 12 + 12) % 12;
                const offset = temperament.degrees[degree] + tuning.getStretchCents(midi);
                const frequency = equalHz(midi, reference) * 2 ** (offset / 1200);
                const result = analyseConcert(tuning, frequency);
                assert.equal(result.midi, midi);
                near(result.cents, 0);
                const nextDegree = (degree + 1) % 12;
                const nextOffset = temperament.degrees[nextDegree] + tuning.getStretchCents(midi + 1);
                const next = equalHz(midi + 1, reference) * 2 ** (nextOffset / 1200);
                const boundary = Math.sqrt(frequency * next);
                assert.equal(analyseConcert(tuning, boundary * 2 ** (-0.001 / 1200)).midi, midi);
                assert.equal(analyseConcert(tuning, boundary * 2 ** (0.001 / 1200)).midi, midi + 1);
              }
            }
          }
        }
      }
    });

    test('transposition relabels equivalent concert keys without changing tuning or stretch', () => {
      const tuning = createTuning();
      const concert = createTuning();
      for (const temperament of tuning.temperaments) {
        tuning.currentSettings.temperament = concert.currentSettings.temperament = temperament.id;
        for (const stretch of ['none', 'minimal', 'medium', 'full']) {
          tuning.currentSettings.stretch = concert.currentSettings.stretch = stretch;
          for (let offset = -11; offset <= 11; offset++) {
            tuning.currentSettings.transposition = String(offset);
            for (let writtenCenter = 0; writtenCenter < 12; writtenCenter++) {
              tuning.currentSettings.pitchCenter = String(writtenCenter);
              concert.currentSettings.pitchCenter = String(((writtenCenter + offset) % 12 + 12) % 12);
              for (const soundingMidi of [33, 57, 60, 69, 81, 105]) {
                const targetOffset = concert.getTargetOffsetCents(soundingMidi);
                const frequency = equalHz(soundingMidi) * 2 ** (targetOffset / 1200);
                const result = analyseConcert(tuning, frequency);
                assert.equal(result.midi, soundingMidi - offset);
                near(result.cents, 0);
              }
            }
          }
        }
      }
      tuning.currentSettings.transposition = '-2';
      tuning.currentSettings.pitchCenter = '0';
      assert.equal(tuning.getPitchCenterLabel(), 'C (concert Bb)');
      tuning.currentSettings.transposition = '0';
      assert.equal(tuning.getPitchCenterLabel(), 'C');
    });

    test('Custom normalizes the tonic, rejects invalid data and keeps extreme steps ordered', () => {
      const tuning = createTuning({ temperament: 'custom' });
      assert.equal(tuning.normalizeDegrees([12, ...Array(11).fill(0)])[0], 0);
      assert.equal(tuning.normalizeDegrees([0]), null);
      assert.equal(tuning.normalizeDegrees([0, NaN, ...Array(10).fill(0)]), null);
      const raw = [12, ...Array.from({ length: 11 }, (_, index) => index % 2 ? -100 : 100)];
      const degrees = tuning.normalizeDegrees(raw);
      assert.equal(raw[0], 12);
      assert.equal(degrees[1], 45);
      assert.equal(degrees[2], -45);
      tuning.currentSettings.customTemperament = degrees;
      for (let center = 0; center < 12; center++) {
        tuning.currentSettings.pitchCenter = String(center);
        for (let midi = 48; midi <= 84; midi++) {
          const offset = tuning.getTemperamentCents(midi);
          near(analyseConcert(tuning, equalHz(midi) * 2 ** (offset / 1200)).cents, 0);
          assert.ok(100 + tuning.getTemperamentCents(midi + 1) - offset >= 10);
        }
      }
    });

    test('history is rescored after reference, temperament, stretch and transposition changes', () => {
      const tuning = createTuning({ temperament: 'just-major', stretch: 'full' }, 441);
      const midi = 69;
      const originalOffset = tuning.getTargetOffsetCents(midi);
      const originalFrequency = equalHz(midi) * 2 ** (originalOffset / 1200);
      const segment = { avgErrRatio: 0, targetOffsetCents: originalOffset, durMs: 1000 };
      tuning.masterCellState[midi] = { segments: [segment], totalVoiceMs: 1000 };
      for (const settings of [
        { temperament: 'equal', pitchCenter: '0', stretch: 'none', transposition: '0' },
        { temperament: 'just-major', pitchCenter: '7', stretch: 'full', transposition: '0' },
        { temperament: 'just-major', pitchCenter: '2', stretch: 'minimal', transposition: '-2' }
      ]) {
        tuning.A4 = 440;
        tuning.currentSettings = settings;
        const writtenMidi = midi - Number(settings.transposition);
        const expected = originalFrequency / (equalHz(midi) * 2 ** (tuning.getTargetOffsetCents(writtenMidi) / 1200)) - 1;
        near(tuning.getRecentWeightedErr([segment], 1, writtenMidi).avgErrRatio, expected);
      }
      tuning.shiftCellStateBySemitones(2);
      assert.equal(tuning.masterCellState[69], undefined);
      assert.equal(tuning.masterCellState[71].segments[0], segment);
      near(tuning.getRecentWeightedErr(tuning.masterCellState[71].segments, 1, 71).avgErrRatio,
        analyseConcert(tuning, originalFrequency).errRatio);
    });
  });
}
```

- [ ] **Step 3: Run against `beta.html` only — must be green**

Run: `TONEMAP_TARGETS=beta.html node --test tests/temperament.test.cjs`
Expected (last lines): `ℹ tests 6` / `ℹ pass 6` / `ℹ fail 0` (the five tests plus "source exposes the tuning engine"). ~12 s.

- [ ] **Step 4: Run the default (all three) — `index.html` and `beta-451.html` must be red *for the right reason***

Run: `node --test tests/temperament.test.cjs 2>&1 | grep -E "^(ℹ (tests|pass|fail)|✖ |  AssertionError)" | cut -c1-160`
Expected: `ℹ tests 18` / `ℹ pass 6` / `ℹ fail 12`, and for each of the two unported builds one line like
`AssertionError [ERR_ASSERTION]: index.html is missing the tuning engine: computeRailsbackCents, getA4OffsetCents, getTemperamentById, normalizeDegrees, getActiveTemperamentDegrees, getPitchCenterPc, getTemperamentCents, getTargetOffsetCents, getLatticeOffsetCents, getPitchCenterLabel, TEMPERAMENTS, TEMPERAMENT_CUSTOM_ID, TEMPERAMENT_EQUAL_DEGREES, TEMPERAMENT_CENT_LIMIT, A4_REFERENCE_HZ`
followed by five `tuning engine was not extracted` failures. This is the intended red state; Tasks 3 and 4 turn each build green.

- [ ] **Step 5: Commit**

```bash
git add tests/tuning-harness.cjs tests/temperament.test.cjs
git commit -m "tests: run the temperament suite against every build

Extract the engine through a shared harness and parameterise the suite over
index.html, beta.html and beta-451.html (TONEMAP_TARGETS). The two unported
builds fail with the list of missing symbols until the port lands.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Frozen fixture and cross-build parity test

**Files:**
- Create: `tests/generate-temperament-vectors.cjs`
- Create: `tests/fixtures/temperament-vectors.json` (generated)
- Create: `tests/fixture-parity.test.cjs`

**Interfaces:**
- Consumes: `loadTuning`, `equalHz`, `analyseConcert` from Task 1.
- Produces: fixture shape `{ generatedFrom, note, temperaments: [{id, degrees[12]}], rows: [{ temperament, pitchCenter, a4, stretch, transposition: 0, inputHz, expect: { midi, cents, targetHz } }] }`. 9 temperaments × centers {0,2,9} × A4 {440,441} × stretch {none,full} × 11 midis × {on target, +30 ¢} = **2,376 rows**. Tolerances in the parity test: cents ±5e-4, targetHz ±5e-6. This is the contract the iOS port tests against.

- [ ] **Step 1: Create `tests/generate-temperament-vectors.cjs`**

```js
// Writes tests/fixtures/temperament-vectors.json: end-to-end cases a port of the
// tuning engine (iOS, or another web build) must reproduce. Each row is one
// input frequency and what the engine must say about it.
//   node tests/generate-temperament-vectors.cjs            # from beta.html
//   TONEMAP_TARGET=index.html node tests/generate-temperament-vectors.cjs
const fs = require('node:fs');
const path = require('node:path');
const { loadTuning, equalHz, analyseConcert } = require('./tuning-harness.cjs');

const target = process.env.TONEMAP_TARGET || 'beta.html';
const createTuning = loadTuning(target);
const probe = createTuning();
const CENTERS = [0, 2, 9];                 // C, D, A
const REFERENCES = [440, 441];
const STRETCHES = ['none', 'full'];
const MIDIS = [33, 45, 57, 60, 64, 67, 69, 72, 81, 93, 105];
const OFFSETS_CENTS = [0, 30];            // on the target, and 30 cents sharp of it
const round = (x, dp) => Number(x.toFixed(dp));

const rows = [];
for (const temperament of probe.temperaments) {
  for (const center of CENTERS) {
    for (const reference of REFERENCES) {
      for (const stretch of STRETCHES) {
        const tuning = createTuning({ temperament: temperament.id, pitchCenter: String(center), stretch }, reference);
        for (const midi of MIDIS) {
          // getTargetOffsetCents() already folds the A4 calibration in, measured from
          // the fixed A4_REFERENCE_HZ anchor -- so the target is anchored at 440 here
          // even when the reference is 441. Anchoring at `reference` would apply it twice.
          const targetHz = equalHz(midi, tuning.A4_REFERENCE_HZ) * 2 ** (tuning.getTargetOffsetCents(midi) / 1200);
          for (const offsetCents of OFFSETS_CENTS) {
            const inputHz = targetHz * 2 ** (offsetCents / 1200);
            const result = analyseConcert(tuning, inputHz);
            rows.push({
              temperament: temperament.id, pitchCenter: center, a4: reference, stretch, transposition: 0,
              inputHz: round(inputHz, 6),
              expect: { midi: result.midi, cents: round(result.cents, 4), targetHz: round(result.targetFreq, 6) }
            });
          }
        }
      }
    }
  }
}

const fixture = {
  generatedFrom: path.basename(target),
  note: 'inputHz -> expect. cents is relative to the combined target (temperament + stretch + A4 calibration) and midi is the nearest TEMPERED note, not the nearest equal-tempered one. The engine measures every offset from a fixed 440 Hz anchor: targetOffsetCents = temperament + stretch + 1200*log2(a4/440). transposition is 0 in every row.',
  temperaments: probe.temperaments.map(t => ({ id: t.id, degrees: t.degrees })),
  rows
};
const out = path.join(__dirname, 'fixtures', 'temperament-vectors.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
// One row per line: compact, but a changed value still shows as a one-line diff.
const body = JSON.stringify({ ...fixture, rows: undefined }, null, 2).replace(/\n}$/, '');
fs.writeFileSync(out, `${body},\n  "rows": [\n${rows.map(r => '    ' + JSON.stringify(r)).join(',\n')}\n  ]\n}\n`);
console.log(`${rows.length} rows from ${target} -> ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
```

- [ ] **Step 2: Generate the fixture from `beta.html`**

Run: `node tests/generate-temperament-vectors.cjs`
Expected: `2376 rows from beta.html -> tests/fixtures/temperament-vectors.json (401006 bytes)` (byte count may differ by a few bytes; row count must be 2376).

- [ ] **Step 3: Sanity-check the fixture — every row is exactly on target or exactly 30 ¢ sharp**

Run: `node -e "const f=require('./tests/fixtures/temperament-vectors.json');const c={};for(const r of f.rows)c[r.expect.cents]=(c[r.expect.cents]||0)+1;console.log(c, f.temperaments.length, f.rows.find(r=>r.a4===441&&r.expect.cents===0))"`
Expected: `{ '0': 1188, '30': 1188 } 9 { temperament: 'equal', pitchCenter: 0, a4: 441, ..., inputHz: 55.125, expect: { midi: 33, cents: 0, targetHz: 55.125 } }`. If any cents value other than 0 or 30 appears, the A4 anchor in the generator is wrong (Findings §5) — do not commit.

- [ ] **Step 4: Create `tests/fixture-parity.test.cjs`**

```js
// Every listed build must reproduce the frozen fixture exactly. This is the
// cross-build parity check for the web files, and the oracle the iOS port
// tests against.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const { loadTuning, analyseConcert } = require('./tuning-harness.cjs');

const TARGETS = (process.env.TONEMAP_TARGETS || 'index.html,beta.html,beta-451.html').split(',').map(s => s.trim()).filter(Boolean);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'temperament-vectors.json'), 'utf8'));

for (const target of TARGETS) {
  describe(`[${target}]`, () => {
    test(`ships the same ${fixture.temperaments.length} temperament tables as the fixture`, () => {
      const createTuning = loadTuning(target);
      const tables = createTuning().temperaments.map(t => ({ id: t.id, degrees: Array.from(t.degrees) }));
      assert.equal(JSON.stringify(tables), JSON.stringify(fixture.temperaments));
    });
    test(`reproduces all ${fixture.rows.length} fixture rows`, () => {
      const createTuning = loadTuning(target);
      const cache = new Map();
      let failures = [];
      for (const row of fixture.rows) {
        const key = `${row.temperament}|${row.pitchCenter}|${row.a4}|${row.stretch}|${row.transposition}`;
        if (!cache.has(key)) cache.set(key, createTuning({ temperament: row.temperament, pitchCenter: String(row.pitchCenter), stretch: row.stretch, transposition: String(row.transposition) }, row.a4));
        const got = analyseConcert(cache.get(key), row.inputHz);
        const ok = got.midi === row.expect.midi && Math.abs(got.cents - row.expect.cents) <= 5e-4 && Math.abs(got.targetFreq - row.expect.targetHz) <= 5e-6;
        if (!ok) failures.push({ row, got: { midi: got.midi, cents: got.cents, targetHz: got.targetFreq } });
      }
      assert.equal(failures.length, 0, `${failures.length} row(s) differ, first: ${JSON.stringify(failures[0])}`);
    });
  });
}
```

- [ ] **Step 5: Run parity against `beta.html` — green by construction; against the others — red**

Run: `TONEMAP_TARGETS=beta.html node --test tests/fixture-parity.test.cjs`
Expected: `ℹ tests 2` / `ℹ pass 2` / `ℹ fail 0`.
Run: `node --test tests/fixture-parity.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 6` / `ℹ pass 2` / `ℹ fail 4` (both unported builds fail on "missing the tuning engine").

- [ ] **Step 6: Commit**

```bash
git add tests/generate-temperament-vectors.cjs tests/fixtures/temperament-vectors.json tests/fixture-parity.test.cjs
git commit -m "tests: freeze temperament target vectors and check every build against them

2,376 end-to-end rows generated from beta.html. This is the parity oracle for
index.html and beta-451.html, and the contract the iOS port will be tested
against. Note in the fixture: targetOffsetCents already carries the A4
calibration from the fixed 440 Hz anchor.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Port to `index.html` (copy `beta.html`, re-lock Hard Mode, strip beta metadata)

**Files:**
- Create: `tests/pro-gate.test.cjs`
- Modify: `index.html` (replaced wholesale, then eight exact edits)
- Modify: `CLAUDE.md` (parity matrix cells for `index.html`)

**Interfaces:**
- Consumes: Task 1 suite, Task 2 parity test.
- Produces: `index.html` identical to `beta.html` except: canonical link instead of `noindex`; `APP_VERSION = "2.13"`; `FREE_ALLOWED` with `sensitivity`; `validModes = FREE_ALLOWED.sensitivity`; `.pro-locked-choice` (56 % opacity) on the Hard label with title `Hard Mode is available in Tonemap Pro`; info bullet ends `Hard Mode is available in Tonemap Pro.`; release-notes `note` is the production text. `tests/pro-gate.test.cjs` with `EXPECT = { 'index.html': true, 'beta.html': false }`.

- [ ] **Step 1: Create the gate test first — it must pass on today's `index.html` (the gate exists) and `beta.html` (unlocked)**

```js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Which files must keep Hard Mode behind the Pro gate, and which may not.
// beta.html is deliberately unlocked for the beta; beta-451.html is the Pro
// build and has no gate at all, so it is not listed.
const EXPECT = { 'index.html': true, 'beta.html': false };
const TARGETS = (process.env.TONEMAP_TARGETS || Object.keys(EXPECT).join(',')).split(',').map(s => s.trim()).filter(Boolean);

function slice(source, start, end, label) {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `Missing ${label}: ${start}`);
  const j = source.indexOf(end, i);
  assert.ok(j >= 0, `Unterminated ${label}`);
  return source.slice(i, j + end.length);
}

for (const target of TARGETS) {
  const file = path.isAbsolute(target) ? target : path.join(__dirname, '..', target);
  const expectLocked = EXPECT[path.basename(target)];
  assert.ok(expectLocked !== undefined, `No gate expectation for ${target}`);
  const source = fs.readFileSync(file, 'utf8');
  const ctx = vm.createContext({ sensitivitySelect: { value: '' }, currentSettings: {} });
  vm.runInContext(
    slice(source, '  const FREE_ALLOWED = Object.freeze({', '});', 'FREE_ALLOWED') + '\n' +
    slice(source, '  function isProLockedValue(', '\n  }', 'isProLockedValue') + '\n' +
    'function loadSensitivity(settings) { let needsPersist = false;\n' +
    slice(source, '    const originalSensitivity = settings.sensitivity;', 'currentSettings.sensitivity = sensitivityVal;', 'sensitivity normalisation') +
    '\n return { stored: currentSettings.sensitivity, rewritten: needsPersist }; }',
    ctx);

  test(`[${target}] Hard Mode is ${expectLocked ? 'Pro-locked' : 'unlocked'}`, () => {
    assert.equal(ctx.isProLockedValue('sensitivity', 'hard'), expectLocked);
    assert.equal(ctx.isProLockedValue('sensitivity', 'medium'), false);
    assert.equal(ctx.isProLockedValue('sensitivity', 'relaxed'), false);
  });

  test(`[${target}] a stored "hard" ${expectLocked ? 'falls back to medium on load' : 'survives a reload'}`, () => {
    const r = ctx.loadSensitivity({ sensitivity: 'hard' });
    assert.equal(r.stored, expectLocked ? 'medium' : 'hard');
    assert.equal(r.rewritten, expectLocked);
    // Field-by-field: objects made inside the vm realm have a foreign
    // Object.prototype, which strict deepEqual rejects.
    const relaxed = ctx.loadSensitivity({ sensitivity: 'relaxed' });
    assert.equal(relaxed.stored, 'relaxed'); assert.equal(relaxed.rewritten, false);
    const junk = ctx.loadSensitivity({ sensitivity: 'turbo' });
    assert.equal(junk.stored, 'medium'); assert.equal(junk.rewritten, true);
  });

  test(`[${target}] Hard label and help text match the gate`, () => {
    const label = source.match(/<label[^>]*for="sensitivityModeHard"[^>]*>/)[0];
    if (expectLocked) {
      assert.match(label, /pro-locked-choice/);
      assert.match(label, /available in Tonemap Pro/);
      assert.match(source, /• Hard: .*Hard Mode is available in Tonemap Pro\./);
    } else {
      assert.doesNotMatch(label, /pro-locked-choice/);
      assert.match(label, /Unlocked in this beta/);
    }
  });

  if (expectLocked) {
    test(`[${target}] is a production page`, () => {
      assert.equal((source.match(/name="robots"/g) || []).length, 0, 'noindex must not ship to production');
      assert.equal((source.match(/rel="canonical"/g) || []).length, 1);
      assert.doesNotMatch(source, /This is a beta build/);
    });
  }
}
```

- [ ] **Step 2: Run it — green on both current files**

Run: `node --test tests/pro-gate.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 7` / `ℹ pass 7` / `ℹ fail 0` (4 for index.html, 3 for beta.html).

- [ ] **Step 3: Copy `beta.html` over `index.html` — the gate test must now go red**

Run: `cp beta.html index.html && TONEMAP_TARGETS=index.html node --test tests/pro-gate.test.cjs 2>&1 | grep -E "^(ℹ (tests|pass|fail)|✖ )"`
Expected: `ℹ pass 0` / `ℹ fail 4` — `Hard Mode is Pro-locked`, `a stored "hard" falls back…`, `Hard label and help text…` and `is a production page` all fail. That is the point: a bare copy ships an unlocked Hard Mode and a `noindex`.

- [ ] **Step 4: Apply the eight production edits**

Save the following as `/tmp/port-index.py` **outside the repo** (it is a one-off, not a project file) and run `python3 /tmp/port-index.py` from the repo root. It re-copies `beta.html` first, so it is safe to re-run.

```python
# Run from the repo root. Turns index.html into the production build of beta.html:
# same code, Hard Mode re-locked, no beta-only page metadata.
import io, shutil
shutil.copyfile("beta.html", "index.html")
c = io.open("index.html", encoding="utf-8").read()
def sub(old, new, label):
    global c
    n = c.count(old); assert n == 1, f"{label}: expected 1 match, got {n}"
    c = c.replace(old, new); print("ok:", label)

sub('<!-- Beta test build: keep it out of search results, and do not point search\n     engines at production as the canonical for this page. -->\n<meta name="robots" content="noindex, nofollow" />\n',
    '<link rel="canonical" href="https://tonemap.live/" />\n', "canonical restored, noindex removed")
sub('window.APP_VERSION = "2.2";', 'window.APP_VERSION = "2.13";', "APP_VERSION")
sub("""  // No setting is gated during the beta: Hard Mode is unlocked here and becomes
  // part of Pro at public release. Quick Record stays gated at its launcher,
  // which does not go through this table. isProLockedValue() returns false for
  // any type absent here, so the call sites can stay as they are.
  const FREE_ALLOWED = Object.freeze({});
""", """  const FREE_ALLOWED = Object.freeze({
    // Only Hard Mode is gated among settings. Quick Record is gated by its launcher.
    sensitivity: new Set(["relaxed", "medium"]),
  });
""", "FREE_ALLOWED re-locked")
sub("""    // Validity, not entitlement -- these are the modes the engine implements.
    // Reading it off FREE_ALLOWED used to reset a saved "hard" back to "medium"
    // on every reload.
    const validModes = new Set(["relaxed", "medium", "hard"]);
""", """    // The Pro allowlist doubles as the validator on purpose: a stored "hard"
    // from a hacked localStorage falls back to "medium" on load.
    const validModes = FREE_ALLOWED.sensitivity;
""", "validModes gate")
sub("""  /* Marks a choice as Pro-branded without implying it is disabled. Hard Mode is
     selectable during the beta, so it carries the badge but not the dimming. */
  .pro-marked-choice {
    white-space: nowrap;
  }
""", """  .pro-locked-choice {
    opacity: 0.56;
    white-space: nowrap;
  }
""", "pro-locked-choice CSS")
sub('class="theme-mode-label pro-marked-choice" for="sensitivityModeHard" title="Tightest dead zone and fastest response. Unlocked in this beta; will be part of Tonemap Pro at public release."',
    'class="theme-mode-label pro-locked-choice" for="sensitivityModeHard" title="Hard Mode is available in Tonemap Pro"', "Hard label")
sub('weighted more heavily. Unlocked in this beta; will be part of Tonemap Pro at public release."',
    'weighted more heavily. Hard Mode is available in Tonemap Pro."', "info bullet")
sub('note: "This is a beta build for testing. If anything looks wrong or behaves oddly \\u2014 especially the new temperaments \\u2014 please tell me at support@tonemap.live."',
    'note: "Thanks for the feedback and feature requests! If you spot anything else, please reach out at support@tonemap.live."', "release-notes note")
io.open("index.html", "w", encoding="utf-8").write(c)
print("index.html written")
```

Expected: eight `ok:` lines then `index.html written`. Any `AssertionError` means a source string drifted — inspect `beta.html`, fix the script's `old` string, re-run.

- [ ] **Step 5: Gate test green again; temperament suite and parity green for `index.html`**

Run: `TONEMAP_TARGETS=index.html node --test tests/pro-gate.test.cjs tests/temperament.test.cjs tests/fixture-parity.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 12` / `ℹ pass 12` / `ℹ fail 0`.

- [ ] **Step 6: Syntax and metadata spot-checks**

Run:
```bash
python3 -c "
import re,io;s=io.open('index.html',encoding='utf-8').read()
js='\n;\n'.join(b for t,b in re.findall(r'<script([^>]*)>(.*?)</script>',s,re.S) if 'src=' not in t and not re.search(r'type\s*=\s*[\"\'](?!.*javascript)',t))
io.open('/tmp/index-check.mjs','w').write(js)
print('robots',s.count('name=\"robots\"'),'| canonical',s.count('rel=\"canonical\"'),'| version',re.search(r'APP_VERSION = \"[^\"]*\"',s).group(0),'| pro-locked-choice',s.count('pro-locked-choice'),'| pro-marked',s.count('pro-marked-choice'),'| beta text',s.count('beta build'))" && node --check /tmp/index-check.mjs && echo JS OK
```
Expected: `robots 0 | canonical 1 | version APP_VERSION = "2.13" | pro-locked-choice 2 | pro-marked 0 | beta text 0` and `JS OK`.

- [ ] **Step 7: Manual browser check (Jeremy or executor with a browser)**

Open `index.html` locally. Options → Mode: Hard shows dimmed `Hard ★ Pro`; clicking it opens the Pro modal and the radio snaps back. Options → Temperament: the new section is present, Custom opens the editor. Performance Pitch: typing `441.5` keeps the decimal; blur shows `441.5`. Top of page: no `noindex` in view-source.

- [ ] **Step 8: Update the parity matrix in `CLAUDE.md`**

Replace the `index.html` cell (second column) in these four rows exactly:

```
| Temperaments, Pitch Center, Custom editor, banner pill | ✓ | ✓ | ✗ | ✗ (only the word, in a stretch label) |
| Decimal A4 — 0.1 Hz; input not clobbered while typing | ✓ | ✓ | ✗ bug present | ✓ `Double`; field re-formats only when unfocused |
| Double-tap-zoom suppression (`touch-action: manipulation`) | ✓ | ✓ | ✗ | n/a |
| Hard Mode — implemented (`HARD_DEADZONE_RATIO`, `biasHard`) | ✓ present, gated | ✓ | ✓ | ✓ |
```

and in *File Roles*, change the `index.html` row's `Hard Mode gated to Pro, no recorder.` to `Hard Mode implemented but Pro-gated, no recorder. Same code as beta.html as of 2026-09 apart from the gate and page metadata.`

- [ ] **Step 9: Commit**

```bash
git add index.html tests/pro-gate.test.cjs CLAUDE.md
git commit -m "Ship temperaments, decimal A4 and beta fixes to production; Hard Mode stays Pro

index.html is now beta.html with Hard Mode re-locked (FREE_ALLOWED +
validator), the canonical link restored in place of the beta noindex, and
APP_VERSION 2.13. tests/pro-gate.test.cjs proves the gate holds and that no
beta metadata ships.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Port to `beta-451.html` (filtered patch + hand-ports)

**Files:**
- Modify: `beta-451.html`
- Modify: `CLAUDE.md` (parity matrix cells for `beta-451.html`; File Roles sentence; "Planned port" paragraph)
- Modify: `docs/temperments.md` (the "Implemented in" sentence)

**Interfaces:**
- Consumes: `index.html` **as committed in Task 3** is *not* used — the delta is `git diff --no-index index.html beta.html`, so run this task from a tree where `index.html` is still the *pre-Task-3* file **or** compute the delta from git: the script below uses the working tree, so **run `git stash`-free: check out the pre-port `index.html` into a temp path first** (Step 1). Also consumes Tasks 1–2 tests.
- Produces: `beta-451.html` with temperaments, decimal A4, touch-action and the other `beta.html` changes; recorder, Pro state, Hard Mode, `APP_VERSION` and canonical untouched; `getStretchCents` brought up to `index.html`'s version; release-notes sections replaced, production note kept.

- [ ] **Step 1: Materialise the pre-port `index.html` the delta is computed against**

After Task 3, `index.html` equals `beta.html` and the diff would be empty. Use the last pre-port commit of `index.html`:

Run: `git show HEAD~1:index.html > /tmp/index-preport.html && git diff --no-index --stat /tmp/index-preport.html beta.html | tail -1`
(If Task 3 was not the immediately preceding commit, replace `HEAD~1` with the commit *before* the Task 3 commit, found via `git log --oneline -- index.html`.)
Expected: `1 file changed, 1766 insertions(+), 118 deletions(-)`. If the numbers differ, stop — the delta is not the one this task was rehearsed with.

- [ ] **Step 2: Save the port script outside the repo and point it at that file**

Save as `/tmp/port-beta-451.py`. It is written to read `index.html`; change the one `git diff` line to use `/tmp/index-preport.html`:

```python
# Run from the repo root. Ports temperaments, the decimal-A4 fix, touch-action and
# the other beta.html changes into beta-451.html, leaving its recorder, Pro build
# state and Hard Mode untouched. Idempotence is NOT guaranteed: run it once on a
# clean beta-451.html (git checkout -- beta-451.html to reset).
import io, os, re, subprocess
from collections import Counter
beta = io.open("beta.html", encoding="utf-8").read()
target = "beta-451.html"

# 1. The index.html -> beta.html diff IS the feature delta. Drop the hunks that
#    must not travel: anything touching Hard Mode (beta-451 already has Hard Mode
#    and no gate) and the beta-only page metadata.
full = subprocess.run(["git", "diff", "--no-index", "index.html", "beta.html"], capture_output=True, text=True).stdout
parts = re.split(r"(?m)^(?=@@ )", full); header, hunks = parts[0], parts[1:]
def changed(h): return "\n".join(l for l in h.splitlines() if l.startswith(("+", "-")) and not l.startswith(("+++", "---")))
HARD = r"HARD_|biasHard|FREE_ALLOWED|validModes|pro-marked|pro-locked|sensitivityModeHard|Unlocked in this beta|Hard Mode|dbgSens|modeText"
BETA_ONLY = r'APP_VERSION|rel="canonical"|name="robots"'
keep = [h for h in hunks if not (re.search(HARD, changed(h)) or re.search(BETA_ONLY, changed(h)))]
print(f"feature delta: {len(hunks)} hunks, applying {len(keep)}, dropping {len(hunks) - len(keep)}")

# 2. Apply. -F3 lets four fuzzy hunks land where they belong (verified by the
#    checks below); the price is one duplicated resolveMode line, removed in step 4.
for ext in (".rej", ".orig"):
    if os.path.exists(target + ext): os.remove(target + ext)
subprocess.run(["patch", "-F3", "-s", target], input=header + "".join(keep), text=True)
rej = io.open(target + ".rej", encoding="utf-8").read() if os.path.exists(target + ".rej") else ""
print("rejected hunks (expect 4; BSD patch renumbers them, identify by content):", len(re.findall(r"(?m)^@@", rej)))
c = io.open(target, encoding="utf-8").read()

def once(needle, label):
    n = c.count(needle); assert n == 1, f"{label}: expected 1 match, got {n}"
def block(start, end):
    i = beta.index(start); j = beta.index(end, i) + len(end); return beta[i:j]

# 3. Hand-port the four rejects and the temperament halves of the three hunks that
#    were dropped only because Hard Mode lines share them.
a = "  const HARD_NEEDLE_TAU_MS = 30;\n"; once(a, "temperament constants anchor")
c = c.replace(a, a + "\n" + block("  // ---------------------------------------------------------------------------\n  // Temperaments\n", "  const TEMPERAMENT_CENT_LIMIT = 45;\n"))
print("ok: TEMPERAMENTS tables + constants")

old = "  function syncARefControls(value) {\n    const valueText = Number.isFinite(value) ? `${value}` : \"\";\n    if (aRefInput) {\n"
once(old, "syncARefControls"); c = c.replace(old, block("  // skipInput: the user is mid-keystroke", "    if (aRefInput && !skipInput) {\n"))
print("ok: syncARefControls skipInput (decimal A4)")

once('let stretchLabel = "None (Equal Temperament)";', "stretchLabel"); c = c.replace('let stretchLabel = "None (Equal Temperament)";', 'let stretchLabel = "None";')
print("ok: debug-panel stretch label")

m = re.findall(r"const normalizedA4 = [^\n]*;", c); assert len(m) == 1 and "roundARefValue" not in m[0], m
c = c.replace(m[0], m[0].replace("? a4ValRaw :", "? roundARefValue(a4ValRaw) :")); assert "roundARefValue(a4ValRaw)" in c
print("ok: stored A4 rounded to 0.1 Hz on load")

m = re.findall(r"  \.a-ref-preset #aRefSelect \{\n    width: [^\n]*;\n    min-width: [^\n]*;\n", c); assert len(m) == 1, m
c = c.replace(m[0], "  .a-ref-preset #aRefSelect {\n    width: 6rem;\n    min-width: 6rem;\n")
print("ok: #aRefSelect width")

a = "  .recording-launcher-shell {"; once(a, "temperament CSS anchor")
# Block A (temperament + Custom-editor CSS) and Block B (Pro-modal structural CSS the
# editor's markup is built on: .pro-modal-overlay/-card/-header/-body) are contiguous
# in beta.html, so one slice captures both -- ending just before .pro-modal-footer,
# which is upgrade-modal-only and not used by the editor. (A slice ending at the
# .recording-launcher-shell anchor instead, as an earlier draft of this script did,
# is empty: that selector precedes the block in beta.html, so start > end.)
block_a_b = beta[beta.index("  /* ---- Temperament control: preset list + Custom button ---- */\n"):beta.index("  .pro-modal-footer {")]
# .temp-editor-note is a <p> inside .pro-modal-body; only this rule (outside Block B)
# gives it its line-height, so it travels separately, placed right after Block B.
extra = "  .pro-modal-body p {\n    margin: 0 0 0.8rem;\n    line-height: 1.55;\n  }\n\n"
c = c.replace(a, block_a_b + extra + a)
print("ok: temperament + Custom editor CSS")
print("ok: Pro-modal structural CSS")

i = beta.index('<div id="temperamentEditor"'); j = beta.index("\n</div>\n", i) + len("\n</div>\n")
a = '\n<script type="module">\n'; once(a, "editor markup anchor (after #paletteOverlay)")
c = c.replace(a, "\n" + beta[i:j] + a)
print("ok: #temperamentEditor markup")

# 4. beta-451 already had the Hard branch in resolveMode; the fuzzy hunk added it again.
dup = '    if (modeRaw === "hard") return "hard";\n' * 2; once(dup, "duplicated resolveMode line")
c = c.replace(dup, '    if (modeRaw === "hard") return "hard";\n'); print("ok: resolveMode de-duplicated")

# 5. beta-451 lagged index.html here: without the currentSettings fallback, stretch
#    reads as 0 wherever the select is not in play. Caught by the fixture parity test.
old = '    if (!stretchSelect) return 0;\n    const mode = stretchSelect.value || "none";\n'
once(old, "getStretchCents"); c = c.replace(old, '    const mode = stretchSelect?.value || currentSettings?.stretch || "none";\n')
print("ok: getStretchCents fallback")

# 6. Release notes: the new sections, with the production note kept.
old = block("        {\n          title: \"Temperaments\",", "      note: \"This is a beta build")
old_451 = c[c.index("        {\n          title: \"Latest update\","):c.index("      note: \"Thanks for the feedback")]
new = old[:old.index("      note: \"This is a beta build")]
c = c.replace(old_451, new); print("ok: release notes sections")

io.open(target, "w", encoding="utf-8").write(c)
for ext in (".rej", ".orig"):
    if os.path.exists(target + ext): os.remove(target + ext)

# 7. Structural checks. Every one of these held in rehearsal; any failure means stop.
bad = []
for n in ["computeRailsbackCents", "interpolateRailsbackCents", "getA4OffsetCents", "getTemperamentById", "normalizeDegrees",
          "getActiveTemperamentDegrees", "getPitchCenterPc", "getTemperamentCents", "getTargetOffsetCents", "getLatticeOffsetCents",
          "getPitchCenterLabel", "getGridColumnWidths", "applyGridColumnWidths", "biasHard", "roundARefValue", "handleARefInputCommit",
          "syncARefControls", "updateTemperamentUiState", "openTemperamentEditor"]:
    if c.count(f"function {n}(") != 1: bad.append(f"function {n} x{c.count(f'function {n}(')}")
for n in ["TEMPERAMENTS", "TEMPERAMENT_CUSTOM_ID", "HARD_DEADZONE_RATIO", "A4_REFERENCE_HZ", "RAILSBACK_ANCHORS"]:
    if c.count(f"  const {n} = ") != 1: bad.append(f"const {n} x{c.count(f'  const {n} = ')}")
for k in ["temperamentEditor", "temperamentBanner", "temperamentSelect", "pitchCenterSelect", "optSectionTemperament", "tempEditorRows", "needleModeEven", "needleModeCentered"]:
    if c.count(f'id="{k}"') != 1: bad.append(f'id="{k}" x{c.count(f"id={chr(34)}{k}{chr(34)}")}')
if c.count('if (modeRaw === "hard") return "hard";') != 1: bad.append("resolveMode hard line")
if c.count("stretchCents") != 0: bad.append(f"stale stretchCents refs: {c.count('stretchCents')}")
if c.count("recorderState") < 200: bad.append("recorder damaged")
if re.search(r'APP_VERSION = "2\.2"', c) or c.count('name="robots"') or c.count('rel="canonical"') != 1: bad.append("beta-only metadata leaked")
# Block A/B CSS selectors landed. .temp-editor-load and .pro-modal-body legitimately
# occur twice each in beta.html itself (a 560px media-query override and the
# .temp-editor-card .pro-modal-body compound-selector override, respectively), so
# beta-451.html should match those counts, not 1.
for sel, want in [(".temperament-control {", 1), (".temperament-custom-btn {", 1), (".temp-editor-card {", 1),
                   (".temp-editor-load {", 2), (".temp-row {", 1), (".temp-editor-hint {", 1),
                   (".option-field.is-disabled {", 1), (".pro-modal-overlay {", 1), (".pro-modal-card {", 1),
                   (".pro-modal-header {", 1), (".pro-modal-body {", 2), (".temp-editor-rows {", 2)]:
    if c.count(sel) != want: bad.append(f"{sel} x{c.count(sel)} (want {want})")
print("structural checks:", "ALL OK" if not bad else bad)
assert not bad
```

Edit: in the `full = subprocess.run([... "index.html", "beta.html"] ...)` line, replace `"index.html"` with `"/tmp/index-preport.html"`.

- [ ] **Step 3: Run it on a clean `beta-451.html`**

Run: `git checkout -- beta-451.html && python3 /tmp/port-beta-451.py`
Expected, in order (the first line is BSD `patch` itself reporting the four rejects the script then hand-ports; it is not an error):
```
4 out of 72 hunks failed--saving rejects to beta-451.html.rej
feature delta: 86 hunks, applying 72, dropping 14
rejected hunks (expect 4; BSD patch renumbers them, identify by content): 4
ok: TEMPERAMENTS tables + constants
ok: syncARefControls skipInput (decimal A4)
ok: debug-panel stretch label
ok: stored A4 rounded to 0.1 Hz on load
ok: #aRefSelect width
ok: temperament + Custom editor CSS
ok: Pro-modal structural CSS
ok: #temperamentEditor markup
ok: resolveMode de-duplicated
ok: getStretchCents fallback
ok: release notes sections
structural checks: ALL OK
```
Any assertion means an anchor drifted: `git checkout -- beta-451.html`, fix the `old`/anchor string, re-run. Never run the script twice on the same file.

- [ ] **Step 4: Temperament suite and parity green for `beta-451.html`; gate test unaffected**

Run: `TONEMAP_TARGETS=beta-451.html node --test tests/temperament.test.cjs tests/fixture-parity.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 8` / `ℹ pass 8` / `ℹ fail 0`. (If the parity test fails on exactly the `stretch=full` rows, the `getStretchCents` step did not apply — see Findings §4.)
Run: `node --test tests/pro-gate.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → `ℹ pass 7`.

- [ ] **Step 5: Full default run — all three builds green**

Run: `node --test tests/*.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `ℹ tests 31` / `ℹ pass 31` / `ℹ fail 0` (temperament 18 + parity 6 + gate 7). ~40 s.

- [ ] **Step 6: Manual browser check of the Pro build**

Open `beta-451.html` locally. Hard is a plain, enabled `Hard` radio (no ★, no dimming — unchanged). Quick Record launcher still opens the recorder. Options → Temperament section present; Custom editor opens (this is the hand-inserted markup — check the Cancel/Apply buttons render as pills like Options' own). Debug panel → Stretch reads `None` when off. Performance Pitch accepts `441.5`.

- [ ] **Step 7: Docs**

`CLAUDE.md` — replace the `beta-451.html` cell (fourth column) in these rows exactly:

```
| Temperaments, Pitch Center, Custom editor, banner pill | ✓ | ✓ | ✓ | ✗ (only the word, in a stretch label) |
| Decimal A4 — 0.1 Hz; input not clobbered while typing | ✓ | ✓ | ✓ | ✓ `Double`; field re-formats only when unfocused |
| Double-tap-zoom suppression (`touch-action: manipulation`) | ✓ | ✓ | ✓ | n/a |
```

In *File Roles*, delete the sentence `Does **not** yet have temperaments or the decimal-A4 fix.` from the `beta-451.html` row. Replace the paragraph beginning `**Planned port (Sept 2026):**` with:
`**Ported 2026-09 (web):** temperaments + decimal-A4 fix + touch-action are in all three web builds; \`node --test tests/*.test.cjs\` proves they compute identical targets. iOS port pending — its oracle is \`tests/fixtures/temperament-vectors.json\`.`

`docs/temperments.md` — replace `Implemented in \`beta.html\` only.` with `Implemented in \`beta.html\`, \`index.html\` and \`beta-451.html\` (identical engines, proven by \`tests/fixture-parity.test.cjs\`); the iOS port is pending.` and, in *Verification*, append: `The suite runs against every build (\`TONEMAP_TARGETS\` to narrow it) and \`tests/fixture-parity.test.cjs\` checks each against the frozen vectors in \`tests/fixtures/\`.`

- [ ] **Step 8: Commit**

```bash
git add beta-451.html CLAUDE.md docs/temperments.md
git commit -m "Port temperaments, decimal A4 and beta fixes to the Pro build

Filtered feature delta from beta.html applied to beta-451.html (Hard Mode and
beta-only hunks dropped), four rejected hunks and three shared hunks ported at
content anchors, resolveMode de-duplicated. Also brings getStretchCents up to
index.html's version -- without the currentSettings fallback the Pro build
computed stretch as 0 in the harness, which the frozen fixture caught.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Release (Jeremy runs the deploy commands)

**Files:**
- Modify: `beta-451.html` (`APP_VERSION` only)
- No repo files for the KV/Pages steps.

- [ ] **Step 1: Match the Pro build's version to production**

Run: `grep -o 'APP_VERSION = "[^"]*"' index.html beta-451.html`
Expected: `index.html:APP_VERSION = "2.13"` and `beta-451.html:APP_VERSION = "2.12"`.
Edit `beta-451.html`: `window.APP_VERSION = "2.12";` → `window.APP_VERSION = "2.13";` (one occurrence). Re-run the grep: both `2.13`.

- [ ] **Step 2: Final full test run, then commit**

Run: `node --test tests/*.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → `ℹ pass 31` / `ℹ fail 0`.
```bash
git add beta-451.html
git commit -m "Pro build: version 2.13

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 3: Upload the Pro build to KV** (from `worker/`; command from `CLAUDE.md`)

```bash
cd worker
wrangler kv key put --remote --namespace-id=25916307ce9d4005b0998afe806127e2 "pro-app.html" --path="../beta-451.html"
```

- [ ] **Step 4: Push; Cloudflare Pages deploys `index.html`**

Run: `git push`. Then verify the live pages:
```bash
curl -s https://tonemap.live/ | grep -c 'name="robots"'          # expect 0
curl -s https://tonemap.live/ | grep -o 'APP_VERSION = "[^"]*"'    # expect "2.13"
curl -s https://tonemap.live/ | grep -c 'id="temperamentSelect"'   # expect 1
```
And `/pro` in a browser with a valid Pro cookie: Temperament section present, version 2.13 in the what's-new overlay.

---

## Next: the iOS port (separate spec and plan, in `tonemap-ios`)

Not a task here — it is a new subsystem in another repo and language and needs its own brainstorm → `docs/superpowers/specs/` → plan cycle there. What this plan hands it:

- **Oracle:** `tests/fixtures/temperament-vectors.json` — 2,376 `inputHz → {midi, cents, targetHz}` rows plus the nine tables. An `XCTest` that loads it and asserts each row within the same tolerances (cents ±5e-4, Hz ±5e-6) is the definition of done for the engine.
- **Domain reference:** `docs/temperments.md` (data model, reference convention, Custom limits).
- **Reference implementation:** `beta-451.html` — the 25 symbols listed in `tests/tuning-harness.cjs` are the engine; port them, not the whole file.
- **Known iOS parity gaps to fold in:** A4 is stored unrounded (web now rounds to 0.1 Hz on commit — see `roundARefValue`); A4 calibration must be composed *inside* the target offset from a fixed 440 Hz anchor (Findings §5), or every non-440 reference will read ~4 ¢ off; Hard Mode stays behind `pro.isPro` (already true).

---

## Self-review (done 2026-09-17)

- **Spec coverage:** temperaments to `index.html` (Task 3), to `beta-451.html` (Task 4), decimal A4 + other beta fixes ride the same delta (Findings §1), Hard Mode segregated (Global Constraints, Task 3 gate test), suite parameterised over all builds (Task 1), iOS handoff defined (Next). `docs/temperments.md` updated (Task 4 Step 7).
- **Placeholders:** none — every code step is the rehearsed file content; every expected output was observed.
- **Name consistency:** `loadTuning`, `equalHz`, `analyseConcert`, `resolveTarget` (harness) used identically in the suite, generator and parity test; `TONEMAP_TARGETS` everywhere except the generator's `TONEMAP_TARGET` (singular, one build in, by design).
