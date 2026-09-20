const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const { loadTuning, resolveTarget, equalHz, analyseConcert } = require('./tuning-harness.cjs');

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

    test('anchoring to A4 keeps A4 on the reference and slides the rest of the lattice', (t) => {
      // Builds that predate the anchor setting skip visibly rather than fail:
      // the engine there is still correct, it just has no second anchor.
      if (!fs.readFileSync(resolveTarget(target), 'utf8').includes('temperamentAnchor')) {
        return t.skip('this build has no temperament anchor setting');
      }
      // Default anchor ("center"): the pitch center keeps its equal-tempered
      // frequency and A drifts by its own degree. "a4": A stays on the reference
      // and every note, the center included, moves by that same amount instead.
      const centered = createTuning({ temperament: 'just-major', pitchCenter: '0' }, 441);
      const anchored = createTuning({ temperament: 'just-major', pitchCenter: '0', temperamentAnchor: 'a4' }, 441);
      near(centered.getTemperamentCents(60), 0);
      near(centered.getTemperamentCents(69), -15.64);
      near(anchored.getTemperamentCents(69), 0);
      near(anchored.getTemperamentCents(60), 15.64);
      const a4 = analyseConcert(anchored, 441);
      assert.equal(a4.midi, 69);
      near(a4.cents, 0);
      near(a4.targetFreq, 441);
      // Every preset and center: A4 lands on the reference, the shift is the
      // same for every note, and the two anchors coincide when A is the center
      // or under Equal.
      for (const temperament of anchored.temperaments) {
        for (let center = 0; center < 12; center++) {
          const a = createTuning({ temperament: temperament.id, pitchCenter: String(center), temperamentAnchor: 'a4' });
          const c = createTuning({ temperament: temperament.id, pitchCenter: String(center) });
          near(a.getTemperamentCents(69), 0);
          const shift = c.getTemperamentCents(69);
          for (let midi = 48; midi < 84; midi++) near(a.getTemperamentCents(midi), c.getTemperamentCents(midi) - shift);
          if (center === 9 || temperament.id === 'equal') near(shift, 0);
        }
      }
      // An unknown value behaves as the default.
      near(createTuning({ temperament: 'just-major', pitchCenter: '0', temperamentAnchor: 'wat' }, 441).getTemperamentCents(60), 0);
    });
  });
}
