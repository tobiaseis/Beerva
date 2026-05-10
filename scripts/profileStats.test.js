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

const { calculateStats, emptyStats, getTrophies, getVolumeMl } = loadTypeScriptModule('src/lib/profileStats.ts');
const {
  BEER_CATALOG,
  beerDraftToPayload,
  getBeverageCatalogItem,
  getBeverageDefaultVolume,
  getBeverageOptionSearchText,
  getBeerLine,
  getSessionBeerSummary,
} = loadTypeScriptModule('src/lib/sessionBeers.ts');

const baseRow = (overrides = {}) => ({
  session_id: 'session-1',
  pub_id: 'pub-1',
  pub_name: 'The Local',
  beer_name: 'Guinness',
  volume: 'Pint',
  quantity: 1,
  abv: 4.2,
  created_at: '2026-05-01T20:00:00.000Z',
  session_started_at: '2026-05-01T20:00:00.000Z',
  ...overrides,
});

const monthRow = (sessionId, isoDate) => baseRow({
  session_id: sessionId,
  created_at: isoDate,
  session_started_at: isoDate,
});

const normalizedBeerStats = calculateStats([
  baseRow({ session_id: 'beer-1', beer_name: 'Guinness' }),
  baseRow({ session_id: 'beer-2', beer_name: ' guinness  ' }),
  baseRow({ session_id: 'beer-3', beer_name: 'GUINNESS' }),
]);

assert.equal(normalizedBeerStats.uniqueBeers, 1, 'beer names should be normalized for unique beer trophies');
assert.equal(normalizedBeerStats.maxBeersInOneDay, 1, 'daily beer variety should use normalized beer names');

const longSessionStats = calculateStats([
  baseRow({
    session_id: 'long-night',
    beer_name: 'Beer A',
    created_at: '2026-05-01T20:00:00.000Z',
    session_started_at: '2026-05-01T20:00:00.000Z',
  }),
  baseRow({
    session_id: 'long-night',
    beer_name: 'Beer B',
    created_at: '2026-05-02T20:00:00.000Z',
    session_started_at: '2026-05-01T20:00:00.000Z',
  }),
  baseRow({
    session_id: 'long-night',
    beer_name: 'Beer C',
    created_at: '2026-05-03T20:00:00.000Z',
    session_started_at: '2026-05-01T20:00:00.000Z',
  }),
]);

assert.equal(longSessionStats.longestDayStreak, 1, 'one long session should not become a multi-day streak');
assert.equal(longSessionStats.maxSessionsInOneDay, 1, 'one long session should count once in its start-day bucket');
assert.equal(longSessionStats.maxBeersInOneDay, 3, 'beer variety still comes from beer rows within the session day');

const crossYearMonths = [
  '2025-12-15T12:00:00.000Z',
  '2026-01-15T12:00:00.000Z',
  '2026-02-15T12:00:00.000Z',
  '2026-03-15T12:00:00.000Z',
  '2026-04-15T12:00:00.000Z',
  '2026-05-15T12:00:00.000Z',
  '2026-06-15T12:00:00.000Z',
  '2026-07-15T12:00:00.000Z',
  '2026-08-15T12:00:00.000Z',
  '2026-09-15T12:00:00.000Z',
  '2026-10-15T12:00:00.000Z',
  '2026-11-15T12:00:00.000Z',
].map((date, index) => monthRow(`cross-year-${index}`, date));

assert.equal(
  calculateStats(crossYearMonths).monthsLogged,
  11,
  'months logged should be the best single-year coverage, not a cross-year month union'
);

assert.equal(
  calculateStats([...crossYearMonths, monthRow('december-2026', '2026-12-15T12:00:00.000Z')]).monthsLogged,
  12,
  'months logged should reach 12 when one calendar year has all months'
);

assert.equal(
  calculateStats([
    baseRow({
      created_at: '2026-05-02T02:30:00.000Z',
      session_started_at: '2026-05-01T10:00:00.000Z',
    }),
  ]).hasLateNightSession,
  false,
  'late-night trophies should use the session start time, not later beer timestamps'
);

assert.equal(
  calculateStats([
    baseRow({
      created_at: '2026-05-01T12:00:00.000Z',
      session_started_at: '2026-05-01T02:30:00.000Z',
    }),
  ]).hasLateNightSession,
  true,
  'sessions started between 3am and 6am Copenhagen time should earn late-night stats'
);

assert.equal(
  getTrophies({ ...emptyStats, strongestAbv: 11.1 }).find((trophy) => trophy.id === 'abv-11')?.earned,
  true,
  'the over 11% ABV trophy should remain available when stats qualify'
);

const mixedDrinkAbvStats = calculateStats([
  baseRow({ session_id: 'pint', beer_name: 'Pint Beer', volume: 'Pint', abv: 5 }),
  baseRow({ session_id: 'bomb', beer_name: 'Jägerbomb', volume: '2cl', abv: 35 }),
]);

assert.equal(
  mixedDrinkAbvStats.avgAbv,
  6,
  'average ABV should be volume-weighted so small strong shots do not dominate full pints'
);

const newBeverageStats = calculateStats([
  baseRow({ session_id: 'rtd-1', beer_name: 'Breezer Mango', volume: '27.5cl', quantity: 2, abv: 4 }),
  baseRow({ session_id: 'rtd-2', beer_name: 'Shaker Sport', volume: '33cl', quantity: 1, abv: 4 }),
  baseRow({ session_id: 'jager-1', beer_name: 'Jagerbomb', volume: '2cl', quantity: 3, abv: 35 }),
]);

assert.equal(newBeverageStats.rtdCount, 3, 'RTD stats should count RTD quantities');
assert.equal(newBeverageStats.uniqueRtds, 2, 'RTD stats should count unique RTD names');
assert.equal(newBeverageStats.maxRtdsInOneDay, 3, 'RTD stats should track the biggest RTD drinking day');
assert.equal(newBeverageStats.jagerbombCount, 3, 'Jägerbomb stats should count Jägerbomb quantities');
assert.equal(newBeverageStats.maxJagerbombsInOneDay, 3, 'Jägerbomb stats should track the biggest Jägerbomb drinking day');

const accentVariantRtdStats = calculateStats([
  baseRow({ session_id: 'rtd-accent-1', beer_name: 'Mokaï Peach', volume: '27.5cl', quantity: 1, abv: 4 }),
  baseRow({ session_id: 'rtd-accent-2', beer_name: 'Mokai Peach', volume: '27.5cl', quantity: 1, abv: 4 }),
]);

assert.equal(accentVariantRtdStats.rtdCount, 2, 'accent variants should still count as RTDs');
assert.equal(accentVariantRtdStats.uniqueRtds, 1, 'accent variants should count as one unique RTD');

const newBeverageTrophies = getTrophies({
  ...emptyStats,
  rtdCount: 10,
  uniqueRtds: 5,
  maxRtdsInOneDay: 3,
  jagerbombCount: 20,
  maxJagerbombsInOneDay: 3,
});

assert.equal(newBeverageTrophies.find((trophy) => trophy.id === 'rtd-variety')?.earned, true);
assert.equal(newBeverageTrophies.find((trophy) => trophy.id === 'jagermeister')?.earned, true);
assert.equal(
  getTrophies({ ...emptyStats, rtdCount: 50 }).find((trophy) => trophy.id === 'rtd-king-benzin')?.earned,
  false,
  'King of Benzin should require more than 50 RTDs'
);
assert.equal(
  getTrophies({ ...emptyStats, rtdCount: 51 }).find((trophy) => trophy.id === 'rtd-king-benzin')?.earned,
  true,
  'King of Benzin should unlock after more than 50 RTDs'
);
assert.match(
  newBeverageTrophies.find((trophy) => trophy.id === 'jager-first')?.description || '',
  /Yogameister/,
  'first Jägerbomb trophy should include the Yogameister copy'
);

const rtdOnlyTrophyStats = calculateStats([
  baseRow({ session_id: 'rtd-only-1', beer_name: 'Breezer Mango', volume: '27.5cl', quantity: 50, abv: 4 }),
  baseRow({ session_id: 'beer-not-rtd', beer_name: 'Guinness', volume: 'Pint', quantity: 10, abv: 4.2 }),
  baseRow({ session_id: 'jager-not-rtd', beer_name: 'Jagerbomb', volume: '2cl', quantity: 10, abv: 35 }),
]);

assert.equal(rtdOnlyTrophyStats.rtdCount, 50, 'Only RTDs should count toward King of Benzin');
assert.equal(
  getTrophies(rtdOnlyTrophyStats).find((trophy) => trophy.id === 'rtd-king-benzin')?.earned,
  false,
  'Non-RTDs should not help unlock King of Benzin'
);

assert.equal(getVolumeMl('2cl'), 20, '2cl servings should count as 20ml');
assert.equal(getVolumeMl('4cl'), 40, '4cl servings should count as 40ml');
assert.equal(getVolumeMl('27.5cl'), 275, '27.5cl RTD servings should count as 275ml');
assert.equal(getVolumeMl('44cl'), 440, '44cl cans should count as 440ml');

assert.equal(
  getBeverageDefaultVolume('Breezer Mango'),
  '27.5cl',
  'RTD catalog items should provide a sensible default serving volume'
);

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Jagerbomb', volume: 'Pint', quantity: 1 }),
  {
    beer_name: 'Jägerbomb',
    volume: '2cl',
    quantity: 1,
    abv: 35,
  },
  'Jägerbomb should only count the 2cl Jägermeister shot at 35% ABV'
);

assert.equal(
  getBeverageCatalogItem('Jaegerbomb')?.name,
  'Jägerbomb',
  'Jaegerbomb should resolve to the Jägerbomb catalog item'
);

assert.match(
  getBeverageOptionSearchText('Jägerbomb'),
  /Jagerbomb/,
  'Jägerbomb search text should include the unaccented alias'
);

assert.equal(
  getBeerLine({ beer_name: 'Jägerbomb', volume: '2cl', quantity: 1 }),
  '1x Jägerbomb',
  'Jägerbomb post text should describe the unit drink, not the counted shot volume'
);

assert.equal(
  getSessionBeerSummary([{ beer_name: 'Jägerbomb', volume: '2cl', quantity: 3, abv: 35 }]),
  '3x Jägerbomb',
  'Jägerbomb summaries should describe quantity as unit drinks'
);

assert.equal(
  BEER_CATALOG.filter((beverage) => beverage.kind === 'rtd').length,
  40,
  'the catalog should include 40 RTDs'
);

console.log('profileStats trophy tests passed');
