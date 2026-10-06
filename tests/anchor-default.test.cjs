const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// A4 is the default temperament anchor in every build (Jeremy, 2026-10-06):
// the Performance Pitch stays put and the pitch center moves by A's offset.
// A missing or unrecognised stored value falls back to the default; only an
// explicit "center" keeps the Pitch Center anchor.
const BUILDS = ['index.html', 'beta.html', 'beta-451.html'];
const TARGETS = (process.env.TONEMAP_TARGETS || BUILDS.join(',')).split(',').map(s => s.trim()).filter(Boolean);

function slice(source, start, end, label) {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `Missing ${label}: ${start}`);
  const j = source.indexOf(end, i);
  assert.ok(j >= 0, `Unterminated ${label}`);
  return source.slice(i, j + end.length);
}

for (const target of TARGETS) {
  const file = path.isAbsolute(target) ? target : path.join(__dirname, '..', target);
  const source = fs.readFileSync(file, 'utf8');

  test(`[${target}] DEFAULT_SETTINGS anchors temperaments on A4`, () => {
    assert.match(source, /\n\s*temperamentAnchor: "a4", \/\/ "center" \| "a4"/);
  });

  test(`[${target}] stored anchors other than "center" load as A4`, () => {
    const ctx = vm.createContext({});
    vm.runInContext(
      'function normalizeAnchor(settings) { let needsPersist = false; const currentSettings = {};\n' +
      slice(source, '    const originalAnchor = settings.temperamentAnchor;',
            'if (originalAnchor !== anchorVal) needsPersist = true;', 'anchor normalisation') +
      '\n return currentSettings.temperamentAnchor; }',
      ctx);
    assert.equal(ctx.normalizeAnchor({}), 'a4');
    assert.equal(ctx.normalizeAnchor({ temperamentAnchor: 'sideways' }), 'a4');
    assert.equal(ctx.normalizeAnchor({ temperamentAnchor: 'a4' }), 'a4');
    assert.equal(ctx.normalizeAnchor({ temperamentAnchor: 'center' }), 'center');
  });
}
