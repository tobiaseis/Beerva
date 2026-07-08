const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath, mocks = {}) => {
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
  compiledModule.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const {
  beerDraftToPayload,
  createEmptyBeerDraft,
  getBeverageDefaultVolume,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  getSessionBeerBreakdownLines,
  getSessionBeerSummary,
  getBeverageCatalogItem,
  mergeBeverageCatalog,
} = loadTypeScriptModule('src/lib/sessionBeers.ts');

const {
  getBeverageSubmissionFallbackAbv,
  getBeverageSubmissionStatusLabel,
  isUnknownBeverageName,
  mapBeverageSubmissionStatus,
} = loadTypeScriptModule('src/lib/beverageSubmissions.ts', {
  './sessionBeers': {
    getBeverageCatalogItem,
    getBeveragePayloadCategory: () => 'beer',
  },
  './supabase': {
    supabase: {
      rpc: async () => ({ data: null, error: null }),
    },
  },
  './timeouts': {
    getErrorMessage: (error, fallback) => error?.message || fallback,
    withTimeout: async (operation) => operation,
  },
});

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

check('remote ordinary beers merge without overriding built-ins', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'Codex Lager', abv: 6.4 },
    { name: 'Tuborg Classic', abv: 99 },
  ]);

  assert.equal(getBeverageCatalogItem('Codex Lager', catalog)?.abv, 6.4);
  assert.equal(getBeverageCatalogItem('Tuborg Classic', catalog)?.abv, 4.6);
});

check('remote wine maps to 15cl default without auto-add', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'House Champagne', abv: 12.5, kind: 'wine', defaultVolume: '15cl' },
  ]);

  assert.equal(getBeverageCatalogItem('House Champagne', catalog)?.kind, 'wine');
  assert.equal(getBeverageDefaultVolume('House Champagne', catalog), '15cl');
  assert.equal(isBeverageVolumeLocked('House Champagne', catalog), false);
  assert.equal(isBeverageAutoAdded('House Champagne', catalog), false);
  assert.deepEqual(
    beerDraftToPayload({ beerName: 'House Champagne', volume: 'Pint', quantity: 1 }, catalog),
    { beer_name: 'House Champagne', volume: 'Pint', quantity: 1, abv: 12.5, beverage_category: 'wine' }
  );
});

check('remote drink maps to normal selectable drink category', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'House Vodka Juice', abv: 37.5, kind: 'drink' },
  ]);

  assert.equal(getBeverageCatalogItem('House Vodka Juice', catalog)?.kind, 'drink');
  assert.equal(getBeverageDefaultVolume('House Vodka Juice', catalog), null);
  assert.equal(isBeverageVolumeLocked('House Vodka Juice', catalog), false);
  assert.equal(isBeverageAutoAdded('House Vodka Juice', catalog), false);
  assert.deepEqual(
    beerDraftToPayload({ beerName: 'House Vodka Juice', volume: '4cl', quantity: 2 }, catalog),
    { beer_name: 'House Vodka Juice', volume: '4cl', quantity: 2, abv: 37.5, beverage_category: 'drink' }
  );
});

check('ordinary beer payload records beer category', () => {
  const catalog = mergeBeverageCatalog([{ name: 'Codex Lager', abv: 6.4, kind: 'beer' }]);

  assert.deepEqual(
    beerDraftToPayload({ beerName: 'Codex Lager', volume: '33cl', quantity: 2 }, catalog),
    { beer_name: 'Codex Lager', volume: '33cl', quantity: 2, abv: 6.4, beverage_category: 'beer' }
  );
});

check('empty draft keeps Pint as the unknown-drink fallback', () => {
  assert.equal(createEmptyBeerDraft().volume, 'Pint');
});

check('manually selected size is preserved in payload', () => {
  assert.deepEqual(
    beerDraftToPayload({ beerName: 'Mystery Pub Ale', volume: '50cl', quantity: 3 }),
    { beer_name: 'Mystery Pub Ale', volume: '50cl', quantity: 3, abv: 5, beverage_category: 'beer' }
  );
});

check('unknown beverage detection respects names and aliases', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'Codex Lager', abv: 6.4, aliases: ['Codex House Lager'] },
  ]);

  assert.equal(isUnknownBeverageName('', catalog), false);
  assert.equal(isUnknownBeverageName('   ', catalog), false);
  assert.equal(isUnknownBeverageName('Tuborg Classic', catalog), false);
  assert.equal(isUnknownBeverageName('Codex House Lager', catalog), false);
  assert.equal(isUnknownBeverageName('Missing Pub Ale', catalog), true);
});

check('submission fallback ABV uses category defaults', () => {
  assert.equal(getBeverageSubmissionFallbackAbv('beer'), 5);
  assert.equal(getBeverageSubmissionFallbackAbv('drink'), 5);
  assert.equal(getBeverageSubmissionFallbackAbv('wine'), 12);
  assert.equal(getBeverageSubmissionFallbackAbv('other'), 5);
  assert.equal(getBeverageSubmissionFallbackAbv(null), 5);
});

check('submission status mapper is defensive', () => {
  assert.equal(mapBeverageSubmissionStatus('pending'), 'pending');
  assert.equal(mapBeverageSubmissionStatus('approved'), 'approved');
  assert.equal(mapBeverageSubmissionStatus('rejected'), 'rejected');
  assert.equal(mapBeverageSubmissionStatus('strange'), null);
});

check('submission status labels are calm and user-facing', () => {
  assert.equal(getBeverageSubmissionStatusLabel('pending'), 'Pending approval');
  assert.equal(getBeverageSubmissionStatusLabel('approved'), 'Approved');
  assert.equal(getBeverageSubmissionStatusLabel('rejected'), 'ABV reset');
  assert.equal(getBeverageSubmissionStatusLabel(null), null);
});

if (failures.length > 0) {
  throw new assert.AssertionError({
    message: `session beer checks failed:\n- ${failures.join('\n- ')}`,
  });
}

console.log('session beer formatting checks passed');
