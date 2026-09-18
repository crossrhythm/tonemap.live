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
