const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const { streakToFlameTier, getFlameTierConfig, FLAME_TIERS } = loadTypeScriptModule('src/lib/streakFlame.ts');

// Tier boundaries
assert.equal(streakToFlameTier(0), 0);
assert.equal(streakToFlameTier(1), 0);
assert.equal(streakToFlameTier(2), 1);
assert.equal(streakToFlameTier(3), 1);
assert.equal(streakToFlameTier(4), 2);
assert.equal(streakToFlameTier(6), 2);
assert.equal(streakToFlameTier(7), 3);
assert.equal(streakToFlameTier(13), 3);
assert.equal(streakToFlameTier(14), 4);
assert.equal(streakToFlameTier(99), 4);

// Config: null below threshold, present at/above
assert.equal(getFlameTierConfig(1), null);
assert.equal(getFlameTierConfig(2).tier, 1);
assert.equal(getFlameTierConfig(14).tier, 4);

// Each defined tier carries the fields the component relies on
for (const t of [1, 2, 3, 4]) {
  const cfg = FLAME_TIERS[t];
  assert.ok(cfg.colors.core && cfg.colors.mid && cfg.colors.outer, `tier ${t} colors`);
  assert.ok(typeof cfg.flickerDurationMs === 'number' && cfg.flickerDurationMs > 0, `tier ${t} duration`);
  assert.ok(typeof cfg.scale === 'number' && cfg.scale > 0, `tier ${t} scale`);
}

console.log('streakFlame tier tests passed');
