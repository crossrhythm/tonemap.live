// Every listed build must reproduce the frozen fixture exactly. This is the
// cross-build parity check for the web files, and the oracle the iOS and
// Android ports test against.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const { loadTuning, analyseConcert } = require('./tuning-harness.cjs');

const TARGETS = (process.env.TONEMAP_TARGETS || 'index.html,beta.html,beta-451.html').split(',').map(s => s.trim()).filter(Boolean);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'temperament-vectors.json'), 'utf8'));

// Tolerances are about one unit in the last place the fixture stores.
const close = (got, want, tol) => Math.abs(got - want) <= tol;
const closePair = (got, want, tol) => close(got[0], want[0], tol) && close(got[1], want[1], tol);

for (const target of TARGETS) {
  describe(`[${target}]`, () => {
    test(`ships the same ${fixture.temperaments.length} temperament tables as the fixture`, () => {
      const createTuning = loadTuning(target);
      const tables = createTuning().temperaments.map(t => ({ id: t.id, degrees: Array.from(t.degrees) }));
      assert.equal(JSON.stringify(tables), JSON.stringify(fixture.temperaments));
    });

    test(`normalizes all ${fixture.customNormalization.length} Custom inputs as the fixture does`, () => {
      const tuning = loadTuning(target)();
      for (const { input, expect } of fixture.customNormalization) {
        const got = tuning.normalizeDegrees(input);
        assert.deepEqual(got ? Array.from(got) : null, expect, `input ${JSON.stringify(input)}`);
      }
    });

    test(`reproduces all ${fixture.rows.length} fixture rows`, () => {
      const createTuning = loadTuning(target);
      const cache = new Map();
      const failures = [];
      for (const row of fixture.rows) {
        const settings = {
          temperament: row.temperament, pitchCenter: String(row.pitchCenter), temperamentAnchor: row.anchor,
          stretch: row.stretch, transposition: String(row.transposition)
        };
        if (row.custom) settings.customTemperament = row.custom;
        const key = JSON.stringify([settings, row.a4]);
        if (!cache.has(key)) cache.set(key, createTuning(settings, row.a4));
        const tuning = cache.get(key);

        const result = analyseConcert(tuning, row.inputHz);
        const span = tuning.getCellCentSpan(result.midi);
        const needle = behavior => {
          tuning.currentSettings.needleBehavior = behavior;
          const { pct, targetPct } = tuning.getNeedleCellPosition(result.midi, result.cents);
          return [pct, targetPct];
        };
        const got = {
          midi: result.midi, cents: result.cents, targetHz: result.targetFreq,
          span: [span.halfBelow, span.halfAbove], needleEven: needle('even'), needleCentered: needle('centered')
        };
        const want = row.expect;
        const ok = got.midi === want.midi
          && close(got.cents, want.cents, 5e-4)
          && close(got.targetHz, want.targetHz, 5e-6)
          && closePair(got.span, want.span, 5e-4)
          && closePair(got.needleEven, want.needleEven, 5e-6)
          && closePair(got.needleCentered, want.needleCentered, 5e-6);
        if (!ok) failures.push({ row, got });
      }
      assert.equal(failures.length, 0, `${failures.length} row(s) differ, first: ${JSON.stringify(failures[0])}`);
    });
  });
}
