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
      assert.doesNotMatch(source, /STATUS: Beta/, 'stale beta status comment must not ship');
    });
  }
}
