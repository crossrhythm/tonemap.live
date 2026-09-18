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
