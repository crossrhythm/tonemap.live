// Writes tests/fixtures/temperament-vectors.json: end-to-end cases a port of the
// tuning engine (iOS, Android, or another web build) must reproduce. Each row is
// one input frequency, the settings in force, and what the engine must say.
//   node tests/generate-temperament-vectors.cjs            # from beta.html
//   TONEMAP_TARGET=index.html node tests/generate-temperament-vectors.cjs
const fs = require('node:fs');
const path = require('node:path');
const { loadTuning, equalHz, analyseConcert } = require('./tuning-harness.cjs');

const target = process.env.TONEMAP_TARGET || 'beta.html';
const createTuning = loadTuning(target);
const probe = createTuning();
const ALL_TEMPERAMENTS = probe.temperaments.map(t => t.id);
const MIDIS = [33, 45, 57, 60, 64, 67, 69, 72, 81, 93, 105];
const OFFSETS_CENTS = [0, 30];            // on the target, and 30 cents sharp of it
const round = (x, dp) => Number(x.toFixed(dp));

// Custom tables are stored RAW: a port must run them through its own
// normalizer (degree 0 forced to 0, the rest clamped to +/-45) before use.
const CUSTOM_TABLES = {
  // Every degree past the clamp, alternating, with a non-zero tonic: the most
  // uneven cells the engine allows (adjacent targets only 10 cents apart).
  extreme: [12, 100, -100, 100, -100, 100, -100, 100, -100, 100, -100, 100],
  mixed: [0, 5, -10, 20.5, -3.25, 0, 44.99, -45, 7, 12.34, -20, 1],
  // Not 12 values, so it is rejected and the engine falls back to Equal.
  invalid: [1, 2, 3]
};

// Raw value -> what the normalizer returns (null = rejected, Equal is used).
// JSON can't carry NaN or Infinity, so those arrive as strings, which is also
// how a hand-edited settings file would carry them.
const NORMALIZATION_INPUTS = [
  [0, 11.73, 3.91, 15.64, -13.69, -1.96, -9.78, 1.96, 13.69, -15.64, -3.91, -11.73],
  CUSTOM_TABLES.extreme,
  [-7, 45, -45, 45.01, -45.01, 0, 0, 0, 0, 0, 0, 0],
  ['0', '12.5', '-3', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
  [0, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 'abc', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 'Infinity', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'not an array',
  null
];

// One row: settings in force + a CONCERT input frequency, and the engine's answer.
const tuningCache = new Map();
function tuningFor(settings) {
  const key = JSON.stringify(settings);
  if (!tuningCache.has(key)) tuningCache.set(key, createTuning(toEngineSettings(settings), settings.a4));
  return tuningCache.get(key);
}

function makeRow(block, settings, writtenMidi, offsetCents) {
  const tuning = tuningFor(settings);
  // getTargetOffsetCents() already folds the A4 calibration in, measured from
  // the fixed A4_REFERENCE_HZ anchor -- so the target is anchored at 440 here
  // even when the reference is 441. Anchoring at `reference` would apply it twice.
  const writtenTargetHz = equalHz(writtenMidi, tuning.A4_REFERENCE_HZ) * 2 ** (tuning.getTargetOffsetCents(writtenMidi) / 1200);
  const inputHz = writtenTargetHz * 2 ** ((settings.transposition * 100 + offsetCents) / 1200);
  const { temperament, custom, pitchCenter, anchor, a4, stretch, transposition } = settings;
  return {
    block, temperament, ...(custom ? { custom } : {}), pitchCenter, anchor, a4, stretch, transposition,
    inputHz: round(inputHz, 6), expect: analyse(tuning, inputHz)
  };
}

function toEngineSettings(s) {
  const out = {
    temperament: s.temperament, pitchCenter: String(s.pitchCenter), temperamentAnchor: s.anchor,
    stretch: s.stretch, transposition: String(s.transposition)
  };
  if (s.custom) out.customTemperament = s.custom;
  return out;
}

// Everything a port is checked on. midi and targetHz are in the WRITTEN domain
// (see the fixture note); span and needle positions describe that midi's cell.
function analyse(tuning, inputHz) {
  const result = analyseConcert(tuning, inputHz);
  const span = tuning.getCellCentSpan(result.midi);
  const needle = behavior => {
    tuning.currentSettings.needleBehavior = behavior;
    const { pct, targetPct } = tuning.getNeedleCellPosition(result.midi, result.cents);
    return [round(pct, 6), round(targetPct, 6)];
  };
  return {
    midi: result.midi,
    cents: round(result.cents, 4),
    targetHz: round(result.targetFreq, 6),
    span: [round(span.halfBelow, 4), round(span.halfAbove, 4)],
    needleEven: needle('even'),
    needleCentered: needle('centered')
  };
}

const base = { anchor: 'center', a4: 440, stretch: 'none', transposition: 0 };
const rows = [];
function sweep(block, grid, offsets = OFFSETS_CENTS) {
  const keys = Object.keys(grid);
  const walk = (i, settings) => {
    if (i === keys.length) {
      for (const midi of MIDIS) for (const offset of offsets) rows.push(makeRow(block, settings, midi, offset));
      return;
    }
    for (const value of grid[keys[i]]) walk(i + 1, { ...settings, [keys[i]]: value });
  };
  walk(0, { ...base });
}

// core: the original fixture -- every preset, three centers, two references,
// no stretch and full Railsback.
sweep('core', { temperament: ALL_TEMPERAMENTS, pitchCenter: [0, 2, 9], a4: [440, 441], stretch: ['none', 'full'] });

// anchor: A4 held on the reference instead of the pitch center.
sweep('anchor', { temperament: ALL_TEMPERAMENTS, pitchCenter: [0, 2, 9], anchor: ['a4'], a4: [440, 441] });

// stretch: the two partial modes, which only act at and above A4.
sweep('stretch', { temperament: ['equal', 'just-major', 'pythagorean'], pitchCenter: [0, 9], a4: [440, 441], stretch: ['minimal', 'medium'] });

// transposition: inputHz is concert pitch; midi is the written note.
sweep('transposition', {
  temperament: ['just-major', 'pythagorean'], pitchCenter: [0, 2], anchor: ['center', 'a4'],
  a4: [441], stretch: ['full'], transposition: [-9, -2, 3, 11]
});

// custom: raw tables, including one the engine must reject.
for (const [name, custom] of Object.entries(CUSTOM_TABLES)) {
  sweep(`custom-${name}`, { temperament: ['custom'], custom: [custom], pitchCenter: [0, 9], anchor: ['center', 'a4'] });
}

// boundary: just inside and just outside each edge of the cell, so a port that
// puts cell edges at +/-50 cents (instead of halfway between tempered targets)
// names the wrong note.
for (const temperament of ['just-major', 'septimal', 'meantone-quarter']) {
  const settings = { ...base, temperament, pitchCenter: 0, a4: 441, stretch: 'full' };
  const tuning = tuningFor(settings);
  for (const midi of MIDIS) {
    const { halfBelow, halfAbove } = tuning.getCellCentSpan(midi);
    for (const offset of [halfAbove - 0.01, halfAbove + 0.01, -(halfBelow - 0.01), -(halfBelow + 0.01)]) {
      rows.push(makeRow('boundary', settings, midi, offset));
    }
  }
}

const customNormalization = NORMALIZATION_INPUTS.map(input => {
  const out = probe.normalizeDegrees(input);
  return { input, expect: out ? Array.from(out) : null };
});

const fixture = {
  generatedFrom: path.basename(target),
  note: [
    'Each row: settings in force, a CONCERT input frequency (inputHz), and what the engine must report.',
    'expect.midi is the nearest TEMPERED note (not the nearest equal-tempered one), in WRITTEN pitch: concert midi minus transposition.',
    'expect.cents is relative to that note\'s combined target (temperament + stretch + A4 calibration).',
    'expect.targetHz is in the written domain too: the concert target times 2^(-transposition/12). With transposition 0 it is simply the target.',
    'The engine measures every offset from a fixed 440 Hz anchor: targetOffsetCents = temperament + stretch(sounding midi) + 1200*log2(a4/440).',
    'expect.span = [halfBelow, halfAbove]: cents from the target to each cell edge, halfway to the neighbouring tempered targets (getCellCentSpan).',
    'expect.needleEven / needleCentered = [pct, targetPct] from getNeedleCellPosition: needle and target line, 0 = flat edge of the cell, 1 = sharp edge.',
    'custom rows carry the RAW table; normalize it first (see customNormalization). anchor is temperamentAnchor ("center" | "a4").'
  ].join(' '),
  temperaments: probe.temperaments.map(t => ({ id: t.id, degrees: t.degrees })),
  customNormalization,
  rows
};
const out = path.join(__dirname, 'fixtures', 'temperament-vectors.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
// One row per line: compact, but a changed value still shows as a one-line diff.
const oneLine = list => list.map(r => '    ' + JSON.stringify(r)).join(',\n');
const body = JSON.stringify({ ...fixture, customNormalization: undefined, rows: undefined }, null, 2).replace(/\n}$/, '');
fs.writeFileSync(out, `${body},\n  "customNormalization": [\n${oneLine(customNormalization)}\n  ],\n  "rows": [\n${oneLine(rows)}\n  ]\n}\n`);
const counts = rows.reduce((acc, r) => ({ ...acc, [r.block]: (acc[r.block] || 0) + 1 }), {});
console.log(`${rows.length} rows from ${target} -> ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
console.log(counts);
