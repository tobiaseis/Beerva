const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = require('node:fs').readFileSync(filename, 'utf8');
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

const {
  analyzeChugContactFrames,
  boxesOverlap,
  getMouthBoxFromLandmarks,
} = loadTypeScriptModule('src/lib/chugDetection.ts');

assert.equal(
  boxesOverlap({ x: 10, y: 10, width: 20, height: 20 }, { x: 25, y: 25, width: 20, height: 20 }),
  true
);
assert.equal(
  boxesOverlap({ x: 10, y: 10, width: 10, height: 10 }, { x: 40, y: 40, width: 10, height: 10 }),
  false
);

assert.deepEqual(
  getMouthBoxFromLandmarks([
    { x: 0.45, y: 0.5 },
    { x: 0.55, y: 0.5 },
    { x: 0.5, y: 0.54 },
  ], 1000, 1000),
  { x: 430, y: 480, width: 140, height: 80 }
);

const frames = [
  { timeMs: 0, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: null },
  { timeMs: 200, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 120, y: 100, width: 80, height: 120 } },
  { timeMs: 350, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 120, y: 100, width: 80, height: 120 } },
  { timeMs: 1000, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 120, y: 100, width: 80, height: 120 } },
  { timeMs: 4300, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 240, y: 100, width: 80, height: 120 } },
  { timeMs: 4650, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 240, y: 100, width: 80, height: 120 } },
];

const result = analyzeChugContactFrames(frames);
assert.equal(result.ok, true);
assert.equal(result.detectedStartMs, 200);
assert.equal(result.detectedEndMs, 4300);
assert.equal(result.durationMs, 4100);
assert.ok(result.confidenceScore > 0.5);

const jitteryNearContactFrames = [
  { timeMs: 0, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 166, y: 96, width: 72, height: 118 } },
  { timeMs: 100, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: null },
  { timeMs: 200, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 168, y: 98, width: 70, height: 118 } },
  { timeMs: 300, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 164, y: 98, width: 70, height: 118 } },
  { timeMs: 1800, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 166, y: 98, width: 70, height: 118 } },
  { timeMs: 1950, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 240, y: 100, width: 80, height: 120 } },
  { timeMs: 2300, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 240, y: 100, width: 80, height: 120 } },
];

const jitteryNearContactResult = analyzeChugContactFrames(jitteryNearContactFrames);
assert.equal(jitteryNearContactResult.ok, true);
assert.equal(jitteryNearContactResult.detectedStartMs, 0);
assert.equal(jitteryNearContactResult.detectedEndMs, 1950);
assert.equal(jitteryNearContactResult.durationMs, 1950);

const failed = analyzeChugContactFrames([{ timeMs: 0, mouthBox: null, bottleBox: null }]);
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'No stable mouth and bottle contact detected.');

console.log('chug detection checks passed');
