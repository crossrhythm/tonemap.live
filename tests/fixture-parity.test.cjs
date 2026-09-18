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
