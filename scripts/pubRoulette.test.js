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
  getRouletteTargetRotation,
  getRouletteNoPubsMessage,
  isRoulettePubInRange,
  pickRouletteWinner,
  prepareRoulettePubs,
  ROULETTE_MAX_DISTANCE_METERS,
  ROULETTE_MAX_WHEEL_PUBS,
} = loadTypeScriptModule('src/lib/pubRoulette.ts');

const pub = (overrides) => ({
  id: overrides.id,
  name: overrides.name || overrides.id,
  city: 'Aalborg',
  distance_meters: overrides.distance_meters,
  use_count: overrides.use_count || 0,
  ...overrides,
});

assert.equal(ROULETTE_MAX_DISTANCE_METERS, 1000);
assert.equal(
  getRouletteNoPubsMessage(),
  'The wheel looked within 1 km and came back thirsty. Try Refresh or search a pub manually.'
);
assert.equal(isRoulettePubInRange(pub({ id: 'inside', distance_meters: 1000 })), true);
assert.equal(isRoulettePubInRange(pub({ id: 'outside', distance_meters: 1001 })), false);
assert.equal(isRoulettePubInRange(pub({ id: 'unknown', distance_meters: null })), false);

const prepared = prepareRoulettePubs([
  pub({ id: 'far', distance_meters: 1200 }),
  pub({ id: 'a', name: 'First', distance_meters: 450, use_count: 1 }),
  pub({ id: 'b', name: 'Second', distance_meters: 130, use_count: 2 }),
  pub({ id: 'a', name: 'First Closer', distance_meters: 300, use_count: 0 }),
  pub({ id: 'unknown', distance_meters: undefined }),
]);

assert.deepEqual(
  prepared.map((item) => item.id),
  ['b', 'a'],
  'roulette pubs should be in-range, deduped, and distance sorted'
);
assert.equal(prepared.find((item) => item.id === 'a')?.distance_meters, 300);

const manyPubs = Array.from({ length: 20 }, (_, index) => pub({
  id: `pub-${index}`,
  distance_meters: index + 1,
}));
assert.equal(
  prepareRoulettePubs(manyPubs).length,
  ROULETTE_MAX_WHEEL_PUBS,
  'wheel should cap the number of visible wedges'
);

const candidates = [
  pub({ id: 'zero', distance_meters: 10 }),
  pub({ id: 'one', distance_meters: 20 }),
  pub({ id: 'two', distance_meters: 30 }),
];

assert.equal(pickRouletteWinner(candidates, () => 0)?.winnerIndex, 0);
assert.equal(pickRouletteWinner(candidates, () => 0.5)?.winnerIndex, 1);
assert.equal(pickRouletteWinner(candidates, () => 0.9999999)?.winnerIndex, 2);
assert.equal(pickRouletteWinner([], () => 0), null);

const targetRotation = getRouletteTargetRotation(2, 4, 0, 1);
assert.equal(
  targetRotation % 360,
  135,
  'target rotation should land the selected wedge under the top pointer'
);
assert.ok(
  getRouletteTargetRotation(1, 6, 725, 2) > 725,
  'target rotation should always keep the wheel moving forward'
);

const recordScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'), 'utf8');
assert.match(
  recordScreenSource,
  /getRouletteNoPubsMessage/,
  'roulette empty results should use the friendly no-pubs message helper'
);
assert.doesNotMatch(
  recordScreenSource,
  /setRouletteError\(\s*lookupError\s*\|\|\s*remoteError\s*\|\|/,
  'roulette empty results should not expose lookup or API messages as the no-pubs copy'
);

console.log('pubRoulette tests passed');
