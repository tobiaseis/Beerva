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

const {
  calculateAlcoholUnits,
  getServingVolumeMl,
} = loadTypeScriptModule('src/lib/alcoholUnits.ts');

assert.equal(getServingVolumeMl('33cl'), 330, '33cl should parse as 330ml');
assert.equal(getServingVolumeMl('500 ml'), 500, 'ml values should parse with spaces');
assert.equal(getServingVolumeMl('0.5l'), 500, 'litre values should parse as ml');
assert.equal(getServingVolumeMl('Schooner'), 379, 'schooner should keep the existing app volume');
assert.equal(getServingVolumeMl(null), 568, 'missing volume should fall back to a true pint');

assert.equal(
  calculateAlcoholUnits([{ volume: '33cl', quantity: 1, abv: 4.6 }]),
  1,
  '33cl at 4.6% ABV should be exactly 1.0 Danish unit after display rounding'
);

assert.equal(
  calculateAlcoholUnits([
    { volume: '33cl', quantity: 2, abv: 4.6 },
    { volume: '50cl', quantity: 1, abv: 5 },
  ]),
  3.6,
  'multiple quantities and serving sizes should sum before rounding'
);

assert.equal(
  calculateAlcoholUnits([
    { volume: '33cl', quantity: 1, abv: null },
    { volume: '33cl', quantity: 1, abv: 'not-a-number' },
  ]),
  0,
  'missing or invalid ABV should contribute 0 units'
);

assert.equal(
  calculateAlcoholUnits([{ volume: '33cl', quantity: -2, abv: 4.6 }]),
  0,
  'negative quantities should not create negative units'
);

console.log('alcohol unit checks passed');
