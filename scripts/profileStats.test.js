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

const { calculateStats, emptyStats, getTrophies } = loadTypeScriptModule('src/lib/profileStats.ts');

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

console.log('profileStats trophy tests passed');
