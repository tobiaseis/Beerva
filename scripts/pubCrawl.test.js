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

const helpersPath = 'src/lib/pubCrawls.ts';
const mapPath = 'src/lib/staticRouteMap.ts';
const mediaCarouselPath = 'src/components/PubCrawlMediaCarousel.tsx';
const feedCardPath = 'src/components/PubCrawlFeedCard.tsx';
const feedScreenPath = 'src/screens/FeedScreen.tsx';
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
  fs.existsSync(path.resolve(__dirname, '..', mediaCarouselPath)),
  'Pub crawl media carousel should exist'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', feedCardPath)),
  'Pub crawl feed card should exist'
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

const feedScreenSource = fs.readFileSync(path.resolve(__dirname, '..', feedScreenPath), 'utf8');
assert.match(feedScreenSource, /addPubCrawlComment\(/, 'pub crawl comments should be written through the crawl comments API');
assert.match(feedScreenSource, /onOpenCheers=\{openCheers/, 'feed should pass the cheers modal handler to pub crawl posts');
assert.match(feedScreenSource, /onImagePress=\{setViewingImageUrl\}/, 'feed should pass the image viewer handler to pub crawl photo slides');

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

console.log('pub crawl tests passed');
