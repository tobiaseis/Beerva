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

const loadTypeScriptModuleWithMocks = (relativePath, mocks) => {
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

const helpersPath = 'src/lib/pubCrawls.ts';
const mapPath = 'src/lib/staticRouteMap.ts';
const routeMapPath = 'src/components/PubCrawlRouteMap.tsx';
const mediaCarouselPath = 'src/components/PubCrawlMediaCarousel.tsx';
const feedCardPath = 'src/components/PubCrawlFeedCard.tsx';
const feedScreenPath = 'src/screens/FeedScreen.tsx';
const profileScreenPath = 'src/screens/ProfileScreen.tsx';
const userProfileScreenPath = 'src/screens/UserProfileScreen.tsx';
const recordScreenPath = 'src/screens/RecordScreen.tsx';
const pubCrawlsApiPath = 'src/lib/pubCrawlsApi.ts';
const migrationPath = 'supabase/migrations/20260510220000_add_pub_crawls.sql';

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', helpersPath)),
  'Pub crawl helpers should exist'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', mapPath)),
  'Static route map helpers should exist'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', routeMapPath)),
  'Pub crawl route map component should exist'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', mediaCarouselPath)),
  'Pub crawl media carousel should exist'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', feedCardPath)),
  'Pub crawl feed card should exist'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', recordScreenPath)),
  'Record screen should exist'
);

const {
  buildPubCrawlMediaSlides,
  calculatePubCrawlSummary,
  mapPubCrawlRow,
} = loadTypeScriptModule(helpersPath);

const {
  getMappedStops,
  getRouteBounds,
  getStaticMapViewport,
  latLonToTile,
  projectLatLonToWorld,
} = loadTypeScriptModule(mapPath);

const crawlRow = {
  id: 'crawl-1',
  user_id: 'user-1',
  status: 'published',
  started_at: '2026-05-10T18:00:00.000Z',
  ended_at: '2026-05-10T23:15:00.000Z',
  published_at: '2026-05-10T23:20:00.000Z',
  created_at: '2026-05-10T18:00:00.000Z',
  profiles: {
    username: 'Mads',
    avatar_url: 'https://example.com/avatar.png',
  },
  pub_crawl_cheers: [{ user_id: 'mate-1' }],
  pub_crawl_comments: [{ id: 'comment-1', body: 'heroic' }],
  stops: [
    {
      id: 'stop-2',
      pub_crawl_id: 'crawl-1',
      crawl_stop_order: 2,
      pub_id: 'pub-2',
      pub_name: 'Second Bar',
      image_url: null,
      comment: null,
      started_at: '2026-05-10T20:00:00.000Z',
      ended_at: '2026-05-10T21:00:00.000Z',
      published_at: '2026-05-10T21:00:00.000Z',
      pubs: {
        latitude: null,
        longitude: null,
        city: 'Aalborg',
        address: 'No map street',
      },
      session_beers: [
        { id: 'beer-3', session_id: 'stop-2', beer_name: 'Tuborg', volume: '50cl', quantity: 3, abv: 4.6 },
      ],
    },
    {
      id: 'stop-1',
      pub_crawl_id: 'crawl-1',
      crawl_stop_order: 1,
      pub_id: 'pub-1',
      pub_name: 'First Bar',
      image_url: 'https://example.com/first.jpg',
      comment: 'started calm',
      started_at: '2026-05-10T18:00:00.000Z',
      ended_at: '2026-05-10T19:45:00.000Z',
      published_at: '2026-05-10T19:45:00.000Z',
      pubs: {
        latitude: 57.0488,
        longitude: 9.9217,
        city: 'Aalborg',
        address: 'First street',
      },
      session_beers: [
        { id: 'beer-1', session_id: 'stop-1', beer_name: 'Guinness', volume: 'Pint', quantity: 2, abv: 4.2 },
        { id: 'beer-2', session_id: 'stop-1', beer_name: 'Shaker', volume: '33cl', quantity: 1, abv: 4 },
      ],
    },
    {
      id: 'stop-3',
      pub_crawl_id: 'crawl-1',
      crawl_stop_order: 3,
      pub_id: 'pub-3',
      pub_name: 'Third Bar',
      image_url: 'https://example.com/third.jpg',
      comment: null,
      started_at: '2026-05-10T21:30:00.000Z',
      ended_at: '2026-05-10T23:15:00.000Z',
      published_at: '2026-05-10T23:15:00.000Z',
      pubs: {
        latitude: 57.043,
        longitude: 9.935,
        city: 'Aalborg',
        address: 'Third street',
      },
      session_beers: [
        { id: 'beer-4', session_id: 'stop-3', beer_name: 'Carlsberg', volume: 'Pint', quantity: 1, abv: 5 },
      ],
    },
  ],
};

const crawl = mapPubCrawlRow(crawlRow);

assert.equal(crawl.id, 'crawl-1');
assert.equal(crawl.userId, 'user-1');
assert.equal(crawl.username, 'Mads');
assert.equal(crawl.cheersCount, 1);
assert.equal(crawl.commentsCount, 1);
assert.deepEqual(
  crawl.stops.map((stop) => `${stop.stopOrder}:${stop.pubName}`),
  ['1:First Bar', '2:Second Bar', '3:Third Bar'],
  'stops should be sorted by crawl_stop_order'
);
assert.equal(crawl.stops[0].beers.length, 2, 'stop beers should stay grouped under their stop');

const summary = calculatePubCrawlSummary(crawl.stops);
assert.equal(summary.barCount, 3);
assert.equal(summary.drinkCount, 7);
assert.equal(summary.truePints, 6.2);
assert.equal(summary.averageAbv, 4.5);
assert.equal(summary.routeLabel, 'First Bar -> Second Bar -> Third Bar');

const summaryWithMissingAbv = calculatePubCrawlSummary([
  {
    ...crawl.stops[0],
    beers: [
      { ...crawl.stops[0].beers[0], volume: 'Pint', quantity: 1, abv: 5 },
      { ...crawl.stops[0].beers[1], volume: 'Pint', quantity: 1, abv: null },
    ],
  },
]);
assert.equal(
  summaryWithMissingAbv.averageAbv,
  5,
  'pub crawl average ABV should ignore drinks without ABV instead of treating them as 0%'
);

const slides = buildPubCrawlMediaSlides(crawl.stops);
assert.equal(slides[0].type, 'map', 'first crawl slide should always be the map');
assert.deepEqual(
  slides.slice(1).map((slide) => `${slide.stopOrder}:${slide.imageUrl}`),
  ['1:https://example.com/first.jpg', '3:https://example.com/third.jpg'],
  'photo slides should skip stops without photos'
);

const mediaCarouselSource = fs.readFileSync(path.resolve(__dirname, '..', mediaCarouselPath), 'utf8');
assert.match(
  mediaCarouselSource,
  /buildPubCrawlMediaSlides/,
  'carousel should use the shared media slide builder that preserves crawl photo order'
);
assert.match(
  mediaCarouselSource,
  /style=\{styles\.photoPressable\}/,
  'photo slides should give the pressable wrapper explicit dimensions so images cannot collapse'
);

const feedCardSource = fs.readFileSync(path.resolve(__dirname, '..', feedCardPath), 'utf8');
assert.match(feedCardSource, /<Surface padded=\{false\} style=\{styles\.card\}>/, 'pub crawl posts should use the normal feed card shell');
assert.match(feedCardSource, /onOpenCheers/, 'pub crawl posts should expose the normal cheers affordance');
assert.match(feedCardSource, /styles\.engagementPanel/, 'pub crawl posts should show the normal engagement preview panel');
assert.match(feedCardSource, /styles\.cardFooter/, 'pub crawl posts should use the normal footer action row');
assert.match(feedCardSource, /getStopDrinkCount/, 'expanded pub crawl stop rows should count drink quantities, not beer rows');
assert.doesNotMatch(feedCardSource, /stop\.beers\.length\}\s*drinks/, 'expanded pub crawl stop rows should not undercount multi-quantity drinks');

const feedScreenSource = fs.readFileSync(path.resolve(__dirname, '..', feedScreenPath), 'utf8');
assert.match(feedScreenSource, /addPubCrawlComment\(/, 'pub crawl comments should be written through the crawl comments API');
assert.match(feedScreenSource, /onOpenCheers=\{openCheers/, 'feed should pass the cheers modal handler to pub crawl posts');
assert.match(feedScreenSource, /onImagePress=\{setViewingImageUrl\}/, 'feed should pass the image viewer handler to pub crawl photo slides');
assert.match(feedScreenSource, /<FeedSessionCard[\s\S]*onImagePress=\{setViewingImageUrl\}/, 'normal feed posts should pass the image viewer handler to session photos');
assert.match(feedScreenSource, /pendingImageOpenRef/, 'normal feed photo taps should delay opening so double-tap cheers still works');
assert.match(feedScreenSource, /loadedSessionCountRef/, 'feed pagination should track loaded normal sessions separately from merged feed items');
assert.match(feedScreenSource, /loadedCrawlCountRef/, 'feed pagination should track loaded pub crawls separately from merged feed items');
assert.match(feedScreenSource, /\.eq\('hide_from_feed', false\)/, 'feed should filter hidden crawl child sessions before paginating');
assert.match(feedScreenSource, /fetchPublishedPubCrawlsForFeedPage\(feedUserIds, FEED_PAGE_SIZE, crawlOffset\)/, 'feed should request paged crawl posts with a crawl-specific offset');

const profileScreenSource = fs.readFileSync(path.resolve(__dirname, '..', profileScreenPath), 'utf8');
const userProfileScreenSource = fs.readFileSync(path.resolve(__dirname, '..', userProfileScreenPath), 'utf8');
assert.match(profileScreenSource, /\.eq\('hide_from_feed', false\)/, 'own profile recent sessions should not show hidden pub crawl child stops');
assert.match(userProfileScreenSource, /\.eq\('hide_from_feed', false\)/, 'user profile recent sessions should not show hidden pub crawl child stops');

const pubCrawlsApiSource = fs.readFileSync(path.resolve(__dirname, '..', pubCrawlsApiPath), 'utf8');
assert.match(pubCrawlsApiSource, /fetchPublishedPubCrawlsForFeedPage/, 'pub crawl feed API should expose a paged fetch helper');
assert.match(pubCrawlsApiSource, /\.range\(offset, offset \+ pageSize\)/, 'pub crawl feed API should fetch one lookahead row for has-more detection');

const recordScreenSource = fs.readFileSync(path.resolve(__dirname, '..', recordScreenPath), 'utf8');
assert.match(recordScreenSource, /styles\.crawlConvertButton/, 'turn-into-crawl should render as a compact button inside the locked pub card');
assert.doesNotMatch(recordScreenSource, /<AppButton\s+label="Turn into Pub Crawl"/, 'turn-into-crawl should not be a full-width AppButton above the pub card');
assert.match(recordScreenSource, /label="End Pub Crawl"[\s\S]*variant="danger"[\s\S]*style=\{styles\.pubCrawlEndButton\}/, 'end pub crawl should use a red-tinted danger button style');
assert.match(recordScreenSource, /photoWarningBypassAction/, 'pub crawl photo warning should remember when the user chose to continue without a photo');
assert.match(recordScreenSource, /photoWarningBypassAction\.current = action/, 'continuing without a photo should bypass the next repeated warning for the same action');
assert.match(recordScreenSource, /const notifyMatesPubCrawlStarted = async/, 'pub crawl notifications should be isolated from conversion success handling');
assert.match(recordScreenSource, /notifyMatesPubCrawlStarted\(crawlState\.crawl\.id\);/, 'turn-into-crawl should fire pub crawl notifications after conversion has succeeded');
assert.doesNotMatch(
  recordScreenSource,
  /const turnIntoPubCrawl[\s\S]*const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(\);[\s\S]*showAlert\('Could not start pub crawl'/,
  'notification auth lookup failures should not trigger a false pub crawl conversion error'
);

const routeMapSource = fs.readFileSync(path.resolve(__dirname, '..', routeMapPath), 'utf8');
assert.doesNotMatch(routeMapSource, /Polyline/, 'route map should not draw lines between pub crawl stop markers');
assert.doesNotMatch(routeMapSource, /buildOsrmWalkingRouteUrl|router\.project-osrm\.org/, 'route map should not fetch route geometry when only markers are shown');
assert.match(routeMapSource, /<Circle/, 'route map should still render numbered marker circles');
assert.match(routeMapSource, /<SvgText/, 'route map should still render stop numbers');

const mappedStops = getMappedStops(crawl.stops);
assert.deepEqual(
  mappedStops.map((stop) => stop.pubName),
  ['First Bar', 'Third Bar'],
  'only stops with finite coordinates should be mapped'
);

const bounds = getRouteBounds(mappedStops);
assert.equal(bounds.missingCount, 1);
assert.ok(bounds.minLatitude <= 57.043 && bounds.maxLatitude >= 57.0488);

const viewport = getStaticMapViewport(crawl.stops, { width: 640, height: 420 });
assert.equal(viewport.mappedStops.length, 2);
assert.equal(viewport.missingCount, 1);
assert.ok(viewport.zoom >= 11 && viewport.zoom <= 17, 'Aalborg route should use a sane city zoom');
assert.ok(viewport.tiles.length > 0 && viewport.tiles.length <= 25, 'viewport should use a small tile grid');
assert.ok(viewport.routePoints.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));

const aalborgTile = latLonToTile(57.0488, 9.9217, 13);
assert.ok(aalborgTile.x > 4300 && aalborgTile.x < 4400);
assert.ok(aalborgTile.y > 2500 && aalborgTile.y < 2600);

const worldPoint = projectLatLonToWorld(57.0488, 9.9217, 13);
assert.ok(Number.isFinite(worldPoint.x));
assert.ok(Number.isFinite(worldPoint.y));

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', migrationPath)),
  'Pub crawl migration should exist'
);
const migrationSql = fs.readFileSync(path.resolve(__dirname, '..', migrationPath), 'utf8');
assert.match(migrationSql, /pub_crawls/, 'migration should create pub_crawls');
assert.match(migrationSql, /hide_from_feed/, 'migration should hide crawl child sessions from feed');
assert.match(migrationSql, /convert_session_to_pub_crawl/, 'migration should create conversion RPC');
assert.match(migrationSql, /publish_pub_crawl/, 'migration should create publish RPC');
assert.match(migrationSql, /cancel_pub_crawl/, 'migration should create cancel RPC');
assert.match(migrationSql, /pub_crawl_started/, 'migration should support pub crawl notifications');

const createHydrationFailingSupabaseMock = () => ({
  rpc: async (name, args) => {
    assert.equal(name, 'convert_session_to_pub_crawl');
    assert.deepEqual(args, { target_session_id: 'session-1' });
    return {
      data: {
        id: 'crawl-1',
        user_id: 'user-1',
        status: 'active',
        started_at: '2026-05-10T18:00:00.000Z',
        ended_at: null,
        published_at: null,
        created_at: '2026-05-10T18:00:00.000Z',
      },
      error: null,
    };
  },
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } } }),
  },
  from: (table) => {
    const builder = {
      select: () => builder,
      in: () => builder,
      order: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve, reject) => {
        const result = table === 'sessions'
          ? { data: null, error: new Error('hydration failed after conversion') }
          : { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  },
});

const createHydrationSuccessfulSupabaseMock = () => ({
  rpc: async (name, args) => {
    assert.equal(name, 'convert_session_to_pub_crawl');
    assert.deepEqual(args, { target_session_id: 'session-2' });
    return {
      data: {
        id: 'crawl-2',
        user_id: 'user-1',
        status: 'active',
        started_at: '2026-05-10T18:00:00.000Z',
        ended_at: null,
        published_at: null,
        created_at: '2026-05-10T18:00:00.000Z',
      },
      error: null,
    };
  },
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } } }),
  },
  from: (table) => {
    const builder = {
      select: () => builder,
      in: () => builder,
      order: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve, reject) => {
        const dataByTable = {
          sessions: [
            {
              id: 'session-1',
              pub_crawl_id: 'crawl-2',
              crawl_stop_order: 1,
              pub_id: 'pub-1',
              pub_name: 'First Bar',
              image_url: null,
              comment: null,
              started_at: '2026-05-10T18:00:00.000Z',
              ended_at: '2026-05-10T19:00:00.000Z',
              published_at: '2026-05-10T19:00:00.000Z',
              created_at: '2026-05-10T18:00:00.000Z',
            },
            {
              id: 'session-2',
              pub_crawl_id: 'crawl-2',
              crawl_stop_order: 2,
              pub_id: 'pub-2',
              pub_name: 'Second Bar',
              image_url: null,
              comment: null,
              started_at: '2026-05-10T19:15:00.000Z',
              ended_at: null,
              published_at: null,
              created_at: '2026-05-10T19:15:00.000Z',
            },
          ],
          pub_crawl_cheers: [],
          pub_crawl_comments: [],
          session_beers: [],
          pubs: [],
          profiles: [],
        };
        return Promise.resolve({ data: dataByTable[table] || [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
});

const runAsyncRegressionTests = async () => {
  const helpersModule = loadTypeScriptModule(helpersPath);
  const { convertActiveSessionToPubCrawl } = loadTypeScriptModuleWithMocks(pubCrawlsApiPath, {
    './pubDirectory': {
      formatPubLabel: (pub) => pub.name,
      incrementPubUseCount: () => {},
    },
    './pubCrawls': helpersModule,
    './supabase': {
      supabase: createHydrationFailingSupabaseMock(),
    },
    './timeouts': {
      getErrorMessage: (error, fallback) => error?.message || fallback,
      withTimeout: async (operation) => operation,
    },
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  let state;
  try {
    state = await convertActiveSessionToPubCrawl('session-1', {
      session: {
        id: 'session-1',
        pub_crawl_id: null,
        crawl_stop_order: null,
        pub_id: 'pub-1',
        pub_name: 'First Bar',
        image_url: 'https://example.com/first.jpg',
        comment: 'started calm',
        started_at: '2026-05-10T18:00:00.000Z',
      },
      beers: [
        {
          id: 'beer-1',
          session_id: 'session-1',
          beer_name: 'Guinness',
          volume: 'Pint',
          quantity: 1,
          abv: 4.2,
          consumed_at: '2026-05-10T18:15:00.000Z',
          created_at: '2026-05-10T18:15:00.000Z',
        },
      ],
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(state.crawl.id, 'crawl-1');
  assert.equal(state.crawl.status, 'active');
  assert.equal(state.activeStop?.id, 'session-1');
  assert.equal(state.activeStop?.crawlId, 'crawl-1');
  assert.equal(state.activeStop?.pubName, 'First Bar');
  assert.equal(state.activeStop?.beers.length, 1);

  const hydratedApi = loadTypeScriptModuleWithMocks(pubCrawlsApiPath, {
    './pubDirectory': {
      formatPubLabel: (pub) => pub.name,
      incrementPubUseCount: () => {},
    },
    './pubCrawls': helpersModule,
    './supabase': {
      supabase: createHydrationSuccessfulSupabaseMock(),
    },
    './timeouts': {
      getErrorMessage: (error, fallback) => error?.message || fallback,
      withTimeout: async (operation) => operation,
    },
  });
  const hydratedState = await hydratedApi.convertActiveSessionToPubCrawl('session-2');

  assert.equal(hydratedState.activeStop?.id, 'session-2');
  assert.equal(hydratedState.activeStop?.stopOrder, 2);
};

runAsyncRegressionTests()
  .then(() => {
    console.log('pub crawl tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
