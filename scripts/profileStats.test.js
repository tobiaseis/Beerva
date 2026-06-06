const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const challengeAwardsPath = 'src/lib/challengeAwards.ts';
const challengeAwardsApiPath = 'src/lib/challengeAwardsApi.ts';
const profileStatsApiPath = 'src/lib/profileStatsApi.ts';
const profileStatsPanelPath = 'src/components/ProfileStatsPanel.tsx';
const profileScreenPath = 'src/screens/ProfileScreen.tsx';
const userProfileScreenPath = 'src/screens/UserProfileScreen.tsx';
const specialMixedDrinksMigrationPath = 'supabase/migrations/20260522100000_add_special_mixed_drinks.sql';
const commonCocktailsMigrationPath = 'supabase/migrations/20260531160000_add_common_cocktails_and_wine.sql';

const exists = (relativePath) => fs.existsSync(path.resolve(__dirname, '..', relativePath));
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

const { calculateStats, calculateTopPubVisits, didUnlockAllTrophies, emptyStats, getTrophies, getVolumeMl } = loadTypeScriptModule('src/lib/profileStats.ts');
const {
  BEER_CATALOG,
  beerDraftToPayload,
  getBeverageCatalogItem,
  getBeverageDefaultVolume,
  getBeverageOptionSearchText,
  getBeerLine,
  getSessionBeerSummary,
  isBeverageAutoAdded,
  VOLUMES,
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

const twoPintWeekRow = (sessionId, isoDate) => baseRow({
  session_id: sessionId,
  volume: 'Pint',
  quantity: 2,
  created_at: isoDate,
  session_started_at: isoDate,
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

const topPubVisits = calculateTopPubVisits([
  baseRow({ session_id: 'alpha-1', pub_id: 'pub-alpha', pub_name: 'Alpha Bar' }),
  baseRow({ session_id: 'alpha-1', pub_id: 'pub-alpha', pub_name: 'Alpha Bar', beer_name: 'Second beer' }),
  baseRow({ session_id: 'alpha-2', pub_id: 'pub-alpha', pub_name: 'Alpha Bar' }),
  baseRow({ session_id: 'alpha-3', pub_id: 'pub-alpha', pub_name: 'Alpha Bar' }),
  baseRow({ session_id: 'bravo-1', pub_id: 'pub-bravo', pub_name: 'Bravo Pub' }),
  baseRow({ session_id: 'bravo-2', pub_id: 'pub-bravo', pub_name: 'Bravo Pub' }),
  baseRow({ session_id: 'charlie-1', pub_id: 'pub-charlie', pub_name: 'Charlie Tap' }),
  baseRow({ session_id: 'charlie-2', pub_id: 'pub-charlie', pub_name: 'Charlie Tap' }),
  baseRow({ session_id: 'delta-1', pub_id: 'pub-delta', pub_name: 'Delta Arms' }),
  baseRow({ session_id: 'echo-1', pub_id: 'pub-echo', pub_name: 'Echo House' }),
  baseRow({ session_id: 'foxtrot-1', pub_id: 'pub-foxtrot', pub_name: 'Foxtrot Inn' }),
  baseRow({ session_id: 'missing-pub', pub_id: null, pub_name: null }),
]);

assert.deepEqual(
  topPubVisits.map((pub) => `${pub.name}:${pub.visitCount}`),
  ['Alpha Bar:3', 'Bravo Pub:2', 'Charlie Tap:2', 'Delta Arms:1', 'Echo House:1'],
  'top pub visits should rank by distinct published sessions, tie by name, and keep the top five'
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

const sixWeekPintStreakStats = calculateStats([
  twoPintWeekRow('week-1', '2026-01-05T18:00:00.000Z'),
  twoPintWeekRow('week-2', '2026-01-12T18:00:00.000Z'),
  twoPintWeekRow('week-3', '2026-01-19T18:00:00.000Z'),
  twoPintWeekRow('week-4', '2026-01-26T18:00:00.000Z'),
  twoPintWeekRow('week-5', '2026-02-02T18:00:00.000Z'),
  twoPintWeekRow('week-6', '2026-02-09T18:00:00.000Z'),
]);
assert.equal(
  sixWeekPintStreakStats.maxTwoPintWeekStreak,
  6,
  'weekly pint streak should count six consecutive Monday-to-Sunday weeks with 2+ true pints'
);
assert.equal(
  getTrophies(sixWeekPintStreakStats).find((trophy) => trophy.id === 'officially-an-alcoholic')?.earned,
  true,
  'Officially an Alcoholic should unlock after 2+ true pints per week for six weeks straight'
);

assert.equal(
  getTrophies({ ...emptyStats, maxSessionsAtSamePub: 10 }).find((trophy) => trophy.id === 'local-legend')?.earned,
  true,
  'Local Legend should unlock after 10 sessions at the same pub'
);

assert.equal(
  getTrophies({ ...emptyStats, maxSessionsAtSamePub: 19 }).find((trophy) => trophy.id === 'regular')?.earned,
  false,
  'Regular should stay locked before 20 sessions at the same pub'
);

assert.equal(
  getTrophies({ ...emptyStats, maxSessionsAtSamePub: 20 }).find((trophy) => trophy.id === 'regular')?.earned,
  true,
  'Regular should unlock after 20 sessions at the same pub'
);

const brokenWeekPintStreakStats = calculateStats([
  twoPintWeekRow('broken-week-1', '2026-01-05T18:00:00.000Z'),
  twoPintWeekRow('broken-week-2', '2026-01-12T18:00:00.000Z'),
  twoPintWeekRow('broken-week-4', '2026-01-26T18:00:00.000Z'),
  twoPintWeekRow('broken-week-5', '2026-02-02T18:00:00.000Z'),
  twoPintWeekRow('broken-week-6', '2026-02-09T18:00:00.000Z'),
  twoPintWeekRow('broken-week-7', '2026-02-16T18:00:00.000Z'),
]);
assert.equal(
  brokenWeekPintStreakStats.maxTwoPintWeekStreak,
  4,
  'weekly pint streak should reset when a calendar week has fewer than 2 true pints'
);
assert.equal(
  getTrophies(brokenWeekPintStreakStats).find((trophy) => trophy.id === 'officially-an-alcoholic')?.earned,
  false,
  'Officially an Alcoholic should stay locked if the 2-pint weeks are not six straight weeks'
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

const specialMixedDrinkStats = calculateStats([
  baseRow({ session_id: 'pint', beer_name: 'Pint Beer', volume: 'Pint', abv: 5 }),
  baseRow({ session_id: 'vodka-orange', beer_name: 'Vodka Orange Juice', volume: '2cl', abv: 37 }),
  baseRow({ session_id: 'coffee-bailey', beer_name: 'Coffee Bailey', volume: '4cl', abv: 17 }),
]);

assert.equal(
  specialMixedDrinkStats.totalPints,
  1.1,
  'Vodka Orange Juice and Coffee Bailey should count only their special mixed-drink serving volumes toward true pints'
);
assert.equal(
  specialMixedDrinkStats.avgAbv,
  6.8,
  'Vodka Orange Juice and Coffee Bailey should use their counted serving volumes for weighted average ABV'
);
assert.equal(
  specialMixedDrinkStats.strongestAbv,
  5,
  'Vodka Orange Juice and Coffee Bailey should not count toward beer-only strongest ABV trophies'
);

const commonCocktailNames = [
  'Gin Hass',
  'Gin & Tonic',
  'Cosmopolitan',
  'Mojito',
  'Margarita',
  'Daiquiri',
  'Old Fashioned',
  'Whiskey Sour',
  'Espresso Martini',
  'Negroni',
  'Pina Colada',
  'Long Island Iced Tea',
  'Sex on the Beach',
  'Moscow Mule',
  'Caipirinha',
  'Aperol Spritz',
  'Dry Martini',
  'Manhattan',
  'Cuba Libre',
  'Tequila Sunrise',
];

assert.equal(commonCocktailNames.length, 20, 'the common cocktail set should include exactly 20 drinks');
commonCocktailNames.forEach((name) => {
  assert.equal(getBeverageCatalogItem(name)?.kind, 'mixed', `${name} should be a locked mixed-drink catalog item`);
});

assert.equal(getBeverageDefaultVolume('White Wine'), '15cl', 'generic white wine should default to a 15cl glass');
assert.equal(getBeverageCatalogItem('White Wine')?.abv, 12, 'generic white wine should use 12% ABV');
assert.equal(getBeverageCatalogItem('White Wine')?.kind, 'wine', 'generic white wine should be classified as wine');
assert.equal(getBeverageDefaultVolume('Red Wine'), '15cl', 'generic red wine should default to a 15cl glass');
assert.equal(getBeverageCatalogItem('Red Wine')?.abv, 13, 'generic red wine should use 13% ABV');
assert.equal(getBeverageCatalogItem('Red Wine')?.kind, 'wine', 'generic red wine should be classified as wine');
assert.equal(isBeverageAutoAdded('Gin Hass'), true, 'Gin Hass should auto-add when selected from the beverage dropdown');
assert.equal(isBeverageAutoAdded('Jagerbomb'), true, 'existing mixed drinks should also auto-add when selected from the beverage dropdown');
assert.equal(isBeverageAutoAdded('Red Wine'), false, 'wine should stay on the normal record flow');
assert.equal(isBeverageAutoAdded('Guinness'), false, 'beer should stay on the normal record flow');

const normalizeCatalogName = (value) => value
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[øö]/g, 'o')
  .replace(/[æä]/g, 'ae')
  .replace(/å/g, 'a')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const newCommonDenmarkBeers = [
  { name: 'Tuborg Grøn Økologisk', abv: 4.6 },
  { name: 'Tuborg Rå', abv: 4.3 },
  { name: 'Carlsberg Brewmasters IPA', abv: 5.2 },
  { name: 'Gamle Carlsberg Porter', abv: 7.8 },
  { name: 'Carlsberg Nordlyst', abv: 2.5 },
  { name: 'Carlsberg Fanbryg', abv: 5.0 },
  { name: 'Jacobsen Original Dark Lager', abv: 5.8 },
  { name: 'Jacobsen Extra Pilsner', abv: 5.5 },
  { name: 'Jacobsen Maj-Bock', abv: 7.5 },
  { name: 'Jacobsen Donker Winter Ale', abv: 7.5 },
  { name: 'Albani Rødhætte', abv: 5.6 },
  { name: 'Albani Giraf Black', abv: 10.0 },
  { name: 'Albani Odense Light', abv: 2.6 },
  { name: 'Albani Odense Extra Light', abv: 0.05 },
  { name: 'Maribo Pilsner', abv: 4.6 },
  { name: 'Maribo Classic', abv: 4.6 },
  { name: 'Maribo Julebryg', abv: 5.6 },
  { name: 'Maribo Guld', abv: 5.7 },
  { name: 'Slots Pilsner', abv: 4.6 },
  { name: 'Slots Classic', abv: 4.6 },
  { name: 'Slots Guld', abv: 5.9 },
  { name: 'Slots Julebryg', abv: 5.6 },
  { name: 'King Pilsner', abv: 4.6 },
  { name: 'Karlens Pilsner', abv: 4.6 },
  { name: 'Karlens Classic', abv: 4.6 },
  { name: 'Karlens Julebryg', abv: 5.6 },
  { name: 'Odin Pilsner', abv: 4.6 },
  { name: 'Pokal Classic', abv: 4.6 },
  { name: 'Royal Classic Øko', abv: 4.8 },
  { name: 'Fuglsang Pilsner', abv: 4.6 },
  { name: 'Fuglsang Black Bird', abv: 4.8 },
  { name: 'Fuglsang Early Bird', abv: 5.5 },
  { name: 'Fuglsang White Bird', abv: 5.0 },
  { name: 'Fur Renæssance Brown Ale', abv: 6.2 },
  { name: 'Fur Alkoholfri IPA', abv: 0.5 },
  { name: 'Fanø Rav', abv: 4.6 },
  { name: 'Fanø Stormflod', abv: 5.8 },
  { name: 'Hancock Saaz Brew', abv: 8.1 },
  { name: 'Skovlyst BirkeBryg', abv: 4.8 },
  { name: 'Herslev Hvedeøl', abv: 5.0 },
  { name: 'Peroni Nastro Azzurro', abv: 5.0 },
  { name: 'Peroni Nastro Azzurro 0.0', abv: 0.0 },
  { name: 'San Miguel Especial', abv: 5.4 },
  { name: 'Estrella Damm', abv: 4.6 },
  { name: 'Birra Moretti', abv: 4.6 },
  { name: 'Asahi Super Dry', abv: 5.0 },
  { name: 'Kirin Ichiban', abv: 5.0 },
  { name: 'Tiger Beer', abv: 5.0 },
  { name: 'Tsingtao', abv: 4.7 },
  { name: 'Desperados', abv: 5.9 },
];

assert.equal(newCommonDenmarkBeers.length, 50, 'the Denmark beer catalog addition should contain exactly 50 beers');
assert.equal(
  new Set(newCommonDenmarkBeers.map((beer) => normalizeCatalogName(beer.name))).size,
  newCommonDenmarkBeers.length,
  'the 50 Denmark beer additions should not duplicate each other'
);
assert.equal(
  new Set(BEER_CATALOG.map((beer) => normalizeCatalogName(beer.name))).size,
  BEER_CATALOG.length,
  'the full beverage catalog should not contain duplicate normalized names'
);

newCommonDenmarkBeers.forEach(({ name, abv }) => {
  const catalogItem = getBeverageCatalogItem(name);
  assert.ok(catalogItem, `${name} should be present in the beverage catalog`);
  assert.equal(catalogItem.abv, abv, `${name} should have the expected ABV`);
  assert.equal(catalogItem.kind ?? 'beer', 'beer', `${name} should remain a normal beer catalog item`);
  assert.equal(isBeverageAutoAdded(name), false, `${name} should not auto-add like a mixed drink`);
});

const semanticDuplicateResolutions = [
  { input: 'Carlsberg Hof', canonical: 'Carlsberg Pilsner' },
  { input: 'Odense Classic', canonical: 'Albani Classic' },
  { input: 'Odense Rød Classic', canonical: 'Albani Rød Pilsner' },
  { input: 'Royal Økologisk', canonical: 'Royal Økologisk Pilsner' },
  { input: 'Hancock Pilsner', canonical: 'Hancock Høker Bajer' },
  { input: 'Hancock Gambrinus', canonical: 'Hancock Old Gambrinus Dark' },
];

const visibleCatalogNames = new Set(BEER_CATALOG.map((beer) => beer.name));
semanticDuplicateResolutions.forEach(({ input, canonical }) => {
  assert.equal(
    visibleCatalogNames.has(input),
    false,
    `${input} should be an alias of ${canonical}, not a second visible beer option`
  );
  assert.equal(
    getBeverageCatalogItem(input)?.name,
    canonical,
    `${input} should resolve to the canonical ${canonical} catalog item`
  );
});

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Gin Hass', volume: 'Pint', quantity: 1 }),
  {
    beer_name: 'Gin Hass',
    volume: '4cl',
    quantity: 1,
    abv: 37.5,
  },
  'Gin Hass should count only the 4cl gin serving at 37.5% ABV'
);

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Cosmo', volume: 'Pint', quantity: 1 }),
  {
    beer_name: 'Cosmopolitan',
    volume: '5.5cl',
    quantity: 1,
    abv: 37.8,
  },
  'Cosmopolitan should resolve its alias and count only vodka plus Cointreau'
);

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Aperol Spritz', volume: 'Pint', quantity: 1 }),
  {
    beer_name: 'Aperol Spritz',
    volume: '15cl',
    quantity: 1,
    abv: 11,
  },
  'Aperol Spritz should count only its Prosecco and Aperol, not the soda water'
);

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Red Wine', volume: '15cl', quantity: 2 }),
  {
    beer_name: 'Red Wine',
    volume: '15cl',
    quantity: 2,
    abv: 13,
  },
  'generic red wine should submit as a normal 15cl 13% wine serving'
);

const cocktailStats = calculateStats([
  baseRow({ session_id: 'pint', beer_name: 'Pint Beer', volume: 'Pint', abv: 5 }),
  baseRow({ session_id: 'gin-hass', beer_name: 'Gin Hass', volume: '4cl', abv: 37.5 }),
  baseRow({ session_id: 'negroni', beer_name: 'Negroni', volume: '9cl', abv: 26.2 }),
]);

assert.equal(
  cocktailStats.strongestAbv,
  5,
  'common cocktails should not count toward beer-only strongest ABV trophies'
);

const wineStats = calculateStats([
  baseRow({ session_id: 'pint', beer_name: 'Pint Beer', volume: 'Pint', abv: 5 }),
  baseRow({ session_id: 'red-wine', beer_name: 'Red Wine', volume: '15cl', abv: 13 }),
]);

assert.equal(
  wineStats.strongestAbv,
  5,
  'generic wine should not count toward beer-only strongest ABV trophies'
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
  true,
  'King of Luderbenzin should unlock at 50+ RTDs'
);
assert.equal(
  getTrophies({ ...emptyStats, rtdCount: 51 }).find((trophy) => trophy.id === 'rtd-king-benzin')?.earned,
  true,
  'King of Luderbenzin should stay unlocked above 50 RTDs'
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
  true,
  'Exactly 50 RTDs should unlock King of Luderbenzin without help from non-RTDs'
);

const longSessionTrophies = getTrophies({ ...emptyStats, maxSessionPints: 25 });
const longSessionTrophyIds = longSessionTrophies.map((trophy) => trophy.id);
const longSessionTrophyTitles = longSessionTrophies.map((trophy) => trophy.title);
assert.equal(
  longSessionTrophyIds.includes('session-20'),
  false,
  '20 pint session trophy should be removed because it cannot be achieved'
);
assert.equal(
  longSessionTrophyIds.includes('session-25'),
  false,
  '25 pint session trophy should be removed because it cannot be achieved'
);
assert.equal(
  longSessionTrophyTitles.includes('20 Pint Session') || longSessionTrophyTitles.includes('25 Pint Session'),
  false,
  'removed session trophies should not appear by title'
);
assert.equal(
  longSessionTrophies.find((trophy) => trophy.id === 'session-15')?.earned,
  true,
  '15 pint session trophy should remain as the highest session trophy'
);

const allTrophiesStats = {
  ...emptyStats,
  totalPints: 1000,
  uniquePubs: 100,
  avgAbv: 8,
  maxSessionPints: 15,
  strongestAbv: 11.1,
  hasLateNightSession: true,
  maxSessionsInOneDay: 7,
  maxPubsInOneDay: 3,
  maxSessionsAtSamePub: 20,
  longestDayStreak: 7,
  maxTwoPintWeekStreak: 6,
  uniqueBeers: 25,
  maxBeersInOneDay: 3,
  hasEarlyBirdSession: true,
  monthsLogged: 12,
  rtdCount: 50,
  uniqueRtds: 5,
  maxRtdsInOneDay: 3,
  jagerbombCount: 100,
  maxJagerbombsInOneDay: 10,
  sambucaCount: 50,
  maxSambucasInOneDay: 10,
};
assert.equal(
  getTrophies(allTrophiesStats).every((trophy) => trophy.earned),
  true,
  'all remaining trophies should be achievable with maxed-out stats'
);

const lockedBaseTrophies = getTrophies(emptyStats);
const partiallyEarnedTrophies = lockedBaseTrophies.map((trophy) => (
  trophy.id === 'first-pint' ? { ...trophy, earned: true } : trophy
));
const fullyEarnedTrophies = lockedBaseTrophies.map((trophy) => ({ ...trophy, earned: true }));
assert.equal(
  didUnlockAllTrophies(lockedBaseTrophies, partiallyEarnedTrophies),
  false,
  'all-trophies prize should not trigger while any trophy remains locked'
);
assert.equal(
  didUnlockAllTrophies(lockedBaseTrophies, fullyEarnedTrophies),
  true,
  'all-trophies prize should trigger when the full trophy set crosses from incomplete to complete'
);
assert.equal(
  didUnlockAllTrophies([], fullyEarnedTrophies),
  false,
  'all-trophies prize should not trigger when the old trophy snapshot is unavailable'
);
assert.equal(
  didUnlockAllTrophies(lockedBaseTrophies, fullyEarnedTrophies.slice(0, 1)),
  false,
  'all-trophies prize should not trigger from a partial trophy snapshot'
);

assert.ok(exists(challengeAwardsPath), 'challenge award mapper should exist');
assert.ok(exists(challengeAwardsApiPath), 'challenge award API should exist');

const { mapChallengeAwardRow } = loadTypeScriptModule(challengeAwardsPath);
const awardTrophy = mapChallengeAwardRow({
  id: 'award-1',
  challenge_id: 'challenge-1',
  user_id: 'user-1',
  award_slug: 'winner-of-karneval-2026',
  title: 'Winner of Karneval 2026',
  description: 'Won KarnevalsDruk 2026 by drinking the most true pints.',
  rank: 1,
  progress_value: 8.44,
  metadata: { true_pints: 8.4 },
  awarded_at: '2026-05-24T04:05:00Z',
});

assert.equal(awardTrophy.id, 'challenge-award-winner-of-karneval-2026');
assert.equal(awardTrophy.title, 'Winner of Karneval 2026');
assert.equal(awardTrophy.kind, 'challenge');
assert.equal(awardTrophy.earned, true);

const karnevalPintTrophy = mapChallengeAwardRow({
  id: 'award-pints',
  challenge_id: 'challenge-1',
  user_id: 'user-1',
  award_slug: 'king-of-karneval-pints',
  title: 'King of Karneval',
  description: 'Congrats, you outperformed everyone else by being an absolute legend.',
  rank: 1,
  progress_value: 12.4,
  metadata: { award_category: 'pints' },
  awarded_at: '2026-05-24T04:05:00Z',
});

const karnevalAbvTrophy = mapChallengeAwardRow({
  id: 'award-abv',
  challenge_id: 'challenge-1',
  user_id: 'user-2',
  award_slug: 'king-of-karneval-abv',
  title: 'King of Karneval',
  description: 'Are you ok? You had the highest ABV-average',
  rank: 1,
  progress_value: 8.8,
  metadata: { award_category: 'average_abv' },
  awarded_at: '2026-05-24T04:05:00Z',
});

assert.equal(karnevalPintTrophy.id, 'challenge-award-king-of-karneval-pints');
assert.equal(karnevalPintTrophy.title, 'King of Karneval');
assert.equal(karnevalPintTrophy.description, 'Congrats, you outperformed everyone else by being an absolute legend.');
assert.equal(karnevalAbvTrophy.id, 'challenge-award-king-of-karneval-abv');
assert.equal(karnevalAbvTrophy.title, 'King of Karneval');
assert.equal(karnevalAbvTrophy.description, 'Are you ok? You had the highest ABV-average');

const profileStatsSource = readSource('src/lib/profileStats.ts');
assert.match(profileStatsSource, /\| 'challenge'/, 'TrophyKind should include challenge awards');

const challengeAwardsApiSource = readSource(challengeAwardsApiPath);
assert.match(challengeAwardsApiSource, /get_challenge_awards/, 'challenge award API should call award RPC');
assert.match(challengeAwardsApiSource, /mapChallengeAwardRow/, 'challenge award API should map award rows');

const challengeProfileStatsPanelSource = readSource(profileStatsPanelPath);
assert.match(challengeProfileStatsPanelSource, /challengeAwards/, 'ProfileStatsPanel should accept challenge awards');
assert.match(challengeProfileStatsPanelSource, /\.\.\.challengeAwards/, 'ProfileStatsPanel should merge challenge awards into trophies');

const profileScreenSource = readSource(profileScreenPath);
assert.match(profileScreenSource, /fetchChallengeAwards/, 'ProfileScreen should fetch current user challenge awards');
assert.match(profileScreenSource, /challengeAwards=\{challengeAwards\}/, 'ProfileScreen should pass challenge awards to stats panel');

const userProfileScreenSource = readSource(userProfileScreenPath);
assert.match(userProfileScreenSource, /fetchChallengeAwards/, 'UserProfileScreen should fetch viewed user challenge awards');
assert.match(userProfileScreenSource, /challengeAwards=\{challengeAwards\}/, 'UserProfileScreen should pass challenge awards to stats panel');

const profileStatsApiSource = readSource(profileStatsApiPath);
assert.match(profileStatsApiSource, /fetchTopPubVisits/, 'profile stats API should expose top pub visit fetching');
assert.match(profileScreenSource, /fetchTopPubVisits/, 'ProfileScreen should fetch current user top pub visits');
assert.match(profileScreenSource, /topPubVisits=\{topPubVisits\}/, 'ProfileScreen should pass top pub visits to stats panel');
assert.match(userProfileScreenSource, /fetchTopPubVisits/, 'UserProfileScreen should fetch viewed user top pub visits');
assert.match(userProfileScreenSource, /topPubVisits=\{topPubVisits\}/, 'UserProfileScreen should pass top pub visits to stats panel');

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

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Vodka Orange Juice', volume: 'Pint', quantity: 1 }),
  {
    beer_name: 'Vodka Orange Juice',
    volume: '2cl',
    quantity: 1,
    abv: 37,
  },
  'Vodka Orange Juice should use the same counted serving logic as Vodka Red Bull'
);

assert.deepEqual(
  beerDraftToPayload({ beerName: 'Coffee Bailey', volume: 'Pint', quantity: 1 }),
  {
    beer_name: 'Coffee Bailey',
    volume: '4cl',
    quantity: 1,
    abv: 17,
  },
  'Coffee Bailey should count only 4cl at 17% ABV'
);

assert.equal(
  getBeverageDefaultVolume('Coffee Bailey'),
  '4cl',
  'Coffee Bailey should lock to the counted 4cl serving'
);

assert.equal(
  VOLUMES.includes('4cl'),
  true,
  'locked Coffee Bailey servings should have a visible 4cl size option'
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
  '1 x Jägerbomb',
  'Jägerbomb post text should use the same spaced quantity format as other drinks'
);

assert.equal(
  getSessionBeerSummary([{ beer_name: 'Jägerbomb', volume: '2cl', quantity: 3, abv: 35 }]),
  '3 x Jägerbomb',
  'Jägerbomb summaries should use the same spaced quantity format as other drinks'
);

assert.equal(
  getBeerLine({ beer_name: 'Sambuca Shot', volume: '2cl', quantity: 1 }),
  '1 x Sambuca Shot',
  'Sambuca post text should use the same spaced quantity format as other drinks'
);

assert.equal(
  getSessionBeerSummary([{ beer_name: 'Sambuca Shot', volume: '2cl', quantity: 4, abv: 38 }]),
  '4 x Sambuca Shot',
  'Sambuca summaries should use the same spaced quantity format as other drinks'
);

assert.equal(
  getBeerLine({ beer_name: 'Coffee Bailey', volume: '4cl', quantity: 1 }),
  '1 x Coffee Bailey',
  'Coffee Bailey post text should use the special mixed-drink quantity format'
);

assert.ok(exists(specialMixedDrinksMigrationPath), 'special mixed drinks migration should exist');
const specialMixedDrinksMigration = readSource(specialMixedDrinksMigrationPath);
assert.match(
  specialMixedDrinksMigration,
  /beer_name = 'Vodka Orange Juice'[\s\S]*volume = '2cl'[\s\S]*abv = 37/,
  'migration should normalize Vodka Orange Juice to the Vodka Red Bull counted serving'
);
assert.match(
  specialMixedDrinksMigration,
  /beer_name = 'Coffee Bailey'[\s\S]*volume = '4cl'[\s\S]*abv = 17/,
  'migration should normalize Coffee Bailey to 4cl at 17% ABV'
);
assert.match(
  specialMixedDrinksMigration,
  /'vodka orange juice'/,
  'migration profile stats should classify Vodka Orange Juice as a special mixed drink'
);
assert.match(
  specialMixedDrinksMigration,
  /'coffee bailey'/,
  'migration profile stats should classify Coffee Bailey as a special mixed drink'
);

assert.ok(exists(commonCocktailsMigrationPath), 'common cocktail and wine migration should exist');
const commonCocktailsMigration = readSource(commonCocktailsMigrationPath);
assert.match(
  commonCocktailsMigration,
  /\('gin hass', 'Gin Hass', '4cl', 37\.5/,
  'migration should normalize Gin Hass to its 4cl gin counted serving'
);
assert.match(
  commonCocktailsMigration,
  /\('cosmopolitan', 'Cosmopolitan', '5\.5cl', 37\.8/,
  'migration should normalize Cosmopolitan to its counted alcoholic ingredients'
);
assert.match(
  commonCocktailsMigration,
  /\('aperol spritz', 'Aperol Spritz', '15cl', 11/,
  'migration should normalize Aperol Spritz to its counted alcoholic ingredients'
);
assert.match(
  commonCocktailsMigration,
  /'gin hass'[\s\S]*'cosmopolitan'[\s\S]*'aperol spritz'/,
  'migration profile stats should classify the common cocktails as special mixed drinks'
);

assert.equal(
  BEER_CATALOG.filter((beverage) => beverage.kind === 'rtd').length,
  40,
  'the catalog should include 40 RTDs'
);

const weeklyStreakMigration = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/migrations/20260511120000_add_two_pint_week_streak_trophy.sql'),
  'utf8'
);
assert.match(weeklyStreakMigration, /max_two_pint_week_streak/, 'weekly pint streak migration should add the RPC stat column');
assert.match(weeklyStreakMigration, /two_pint_week_streaks/, 'weekly pint streak migration should calculate consecutive qualifying weeks');

const profileStatsPanelSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/ProfileStatsPanel.tsx'),
  'utf8'
);
assert.match(profileStatsPanelSource, /Longest Streak/, 'profile stats panel should show a longest streak box under best session');
assert.match(profileStatsPanelSource, /stats\.longestDayStreak/, 'longest streak box should use the existing longest day streak stat');
assert.match(profileStatsPanelSource, /highScoreGrid/, 'best session and streak boxes should sit side-by-side in one row');
assert.match(profileStatsPanelSource, /Show best session details/, 'best session stat box should open a details view');
assert.match(profileStatsPanelSource, /Show longest streak details/, 'longest streak stat box should open a details view');
assert.match(
  profileStatsPanelSource,
  /Unlock all trophies to get a secret prize!/,
  'trophy cabinet should tease the all-trophies prize'
);
assert.doesNotMatch(
  profileStatsPanelSource,
  /<Text style=\{styles\.highScoreHint\}/,
  'best session and streak boxes should not show explanatory copy until pressed'
);

const feedScreenSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'),
  'utf8'
);
assert.match(feedScreenSource, /allTrophiesUnlocked/, 'feed should receive the all-trophies prize route param');
assert.match(feedScreenSource, /AllTrophiesUnlockedModal/, 'feed should render the all-trophies prize modal');
assert.match(
  feedScreenSource,
  /allTrophiesUnlocked === true/,
  'feed should only open the all-trophies prize for an explicit boolean true route param'
);

const trophyUnlockModalSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/TrophyUnlockModal.tsx'),
  'utf8'
);
assert.match(trophyUnlockModalSource, /WOW!/, 'all-trophies prize modal should celebrate with WOW!');
assert.match(
  trophyUnlockModalSource,
  /You have unlocked all trophies\. Congratulations on needing a new liver!/,
  'all-trophies prize modal should use the requested prize message'
);

const recordScreenSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'),
  'utf8'
);
assert.match(
  recordScreenSource,
  /didUnlockAllTrophies\(oldTrophies,\s*newTrophies\)/,
  'ending a session should use the shared all-trophies transition guard'
);
assert.match(
  profileStatsSource,
  /oldTrophies\.some\(\(trophy\) => !trophy\.earned\)/,
  'all-trophies helper should only trigger when the user just crossed the finish line'
);
assert.match(
  recordScreenSource,
  /allTrophiesUnlocked/,
  'ending a session should pass the all-trophies prize flag to the feed'
);

// --- Current streak ---
// All rows use 20:00 UTC (= 22:00 Copenhagen, same calendar date, well past the 6am rollover),
// so each row's drinking day equals its UTC calendar date. referenceDate is passed explicitly
// so tests do not depend on the real clock.
const dayRow = (isoDate, id) => baseRow({
  session_id: id,
  created_at: `${isoDate}T20:00:00.000Z`,
  session_started_at: `${isoDate}T20:00:00.000Z`,
});
const REF = new Date('2026-05-10T20:00:00.000Z'); // "today" drinking day = 2026-05-10

// Two consecutive days ending today -> streak 2 (active)
assert.equal(
  calculateStats([dayRow('2026-05-09', 's1'), dayRow('2026-05-10', 's2')], REF).currentStreak,
  2
);

// Ends yesterday (grace day) -> still active
assert.equal(
  calculateStats([dayRow('2026-05-08', 's1'), dayRow('2026-05-09', 's2')], REF).currentStreak,
  2
);

// Ends two days ago -> decayed to 0
assert.equal(
  calculateStats([dayRow('2026-05-07', 's1'), dayRow('2026-05-08', 's2')], REF).currentStreak,
  0
);

// Gap inside the run: only the run ending today counts (08 broken by missing 09... here 10 only)
assert.equal(
  calculateStats([dayRow('2026-05-07', 's1'), dayRow('2026-05-10', 's2')], REF).currentStreak,
  1
);

// Longer active run with an earlier gap -> counts only the trailing consecutive run
assert.equal(
  calculateStats(
    [dayRow('2026-05-05', 's0'), dayRow('2026-05-08', 's1'), dayRow('2026-05-09', 's2'), dayRow('2026-05-10', 's3')],
    REF
  ).currentStreak,
  3
);

// No sessions -> 0
assert.equal(calculateStats([], REF).currentStreak, 0);

console.log('current streak tests passed');

console.log('profileStats trophy tests passed');
