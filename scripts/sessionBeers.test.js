const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

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

const {
  getSessionBeerBreakdownLines,
  getSessionBeerSummary,
} = loadTypeScriptModule('src/lib/sessionBeers.ts');

const duplicateTuborgRows = [
  {
    id: 'beer-1',
    beer_name: 'Tuborg Classic',
    volume: '33cl',
    quantity: 1,
    abv: 4.6,
  },
  {
    id: 'beer-2',
    beer_name: 'Tuborg Classic',
    volume: '33cl',
    quantity: 1,
    abv: 4.6,
  },
];

const failures = [];

const check = (label, assertion) => {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
};

check('feed summary aggregates duplicate beverage rows', () => {
  assert.equal(
    getSessionBeerSummary(duplicateTuborgRows),
    '2 x Tuborg Classic'
  );
});

check('expanded stats expose an aggregation helper', () => {
  assert.equal(
    typeof getSessionBeerBreakdownLines,
    'function',
    'getSessionBeerBreakdownLines should be exported'
  );
});

check('expanded stats aggregates duplicate serving rows', () => {
  assert.deepEqual(
    getSessionBeerBreakdownLines(duplicateTuborgRows),
    ['2 x 33cl of Tuborg Classic']
  );
});

check('expanded stats keeps different serving sizes separate', () => {
  assert.deepEqual(
    getSessionBeerBreakdownLines([
      ...duplicateTuborgRows,
      {
        id: 'beer-3',
        beer_name: 'Tuborg Classic',
        volume: 'Pint',
        quantity: 1,
        abv: 4.6,
      },
    ]),
    ['2 x 33cl of Tuborg Classic', 'Pint of Tuborg Classic']
  );
});

check('feed summary collapses multiple beverage kinds into a count', () => {
  assert.equal(
    getSessionBeerSummary([
      { beer_name: 'Tuborg Classic', volume: '33cl', quantity: 4, abv: 4.6 },
      { beer_name: 'Guinness', volume: 'Pint', quantity: 3, abv: 4.2 },
      { beer_name: 'Carlsberg Pilsner', volume: '50cl', quantity: 5, abv: 4.6 },
    ]),
    '12 drinks across 3 kinds'
  );
});

if (failures.length > 0) {
  throw new assert.AssertionError({
    message: `session beer checks failed:\n- ${failures.join('\n- ')}`,
  });
}

console.log('session beer formatting checks passed');
