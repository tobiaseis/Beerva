const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.join(root, relativePath);
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

const run = async () => {
  const { TimeoutError, withRetryableTimeout, withTimeout } = loadTypeScriptModule('src/lib/timeouts.ts');

  let timedOut = false;
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, 'Too slow.', () => {
      timedOut = true;
    }),
    (error) => error instanceof TimeoutError && error.message === 'Too slow.'
  );
  assert.equal(timedOut, true, 'withTimeout should call its timeout cleanup hook');

  const signals = [];
  let attempts = 0;
  const result = await withRetryableTimeout(
    (signal) => {
      attempts += 1;
      signals.push(signal);
      return attempts === 1 ? new Promise(() => {}) : Promise.resolve('saved');
    },
    5,
    'Too slow.'
  );

  assert.equal(result, 'saved');
  assert.equal(attempts, 2);
  assert.equal(signals[0].aborted, true, 'timed-out attempts should be aborted before retrying');
  assert.equal(signals[1].aborted, false, 'successful attempts should remain active');

  console.log('timeout retry checks passed');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
