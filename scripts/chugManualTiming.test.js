const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, moduleFilename) => {
  const moduleSource = fs.readFileSync(moduleFilename, 'utf8');
  const { outputText: compiledSource } = ts.transpileModule(moduleSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: moduleFilename,
  });
  module._compile(compiledSource, moduleFilename);
};

const filename = path.resolve(__dirname, '..', 'src/lib/chugManualTiming.ts');
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

const {
  CHUG_MANUAL_PLAYBACK_RATE,
  calculateManualChugDuration,
  getVideoPlaybackTimestampMs,
} = compiledModule.exports;

assert.equal(CHUG_MANUAL_PLAYBACK_RATE, 0.75);
assert.equal(getVideoPlaybackTimestampMs(1.234), 1234);
assert.equal(getVideoPlaybackTimestampMs(0), 0);
assert.equal(getVideoPlaybackTimestampMs(-1), null);
assert.equal(getVideoPlaybackTimestampMs(Number.NaN), null);
assert.equal(calculateManualChugDuration(1200, 6100), 4900);
assert.equal(calculateManualChugDuration(null, 6100), null);
assert.equal(calculateManualChugDuration(6100, 1200), null);
assert.equal(calculateManualChugDuration(0, 15001), null);

console.log('chug manual timing checks passed');
