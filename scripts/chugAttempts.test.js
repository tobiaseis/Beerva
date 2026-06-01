const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = require('node:fs').readFileSync(filename, 'utf8');
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
  CHUG_REQUIRED_VOLUME,
  formatChugDuration,
  formatChugStatusLabel,
  getChugBeerOptions,
  getFastestVisibleChugAttempt,
  getChugStatSubtitle,
  getVisibleChugStat,
  isBottleChugEligibleBeer,
  mapChugAttemptRow,
} = loadTypeScriptModule('src/lib/chugAttempts.ts');

const catalog = [
  { name: 'Tuborg Gron', abv: 4.6 },
  { name: 'Breezer Lime', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Sambuca Shot', abv: 40, kind: 'mixed', defaultVolume: '2cl', countedVolume: '2cl' },
];

assert.equal(CHUG_REQUIRED_VOLUME, '33cl');
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Tuborg Gron', volume: '33cl', quantity: 1 }, catalog), true);
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Tuborg Gron', volume: '50cl', quantity: 1 }, catalog), false);
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Breezer Lime', volume: '33cl', quantity: 1 }, catalog), false);
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Sambuca Shot', volume: '33cl', quantity: 1 }, catalog), false);
assert.deepEqual(getChugBeerOptions(catalog), ['Tuborg Gron']);

assert.equal(formatChugDuration(4800), '4.8s');
assert.equal(formatChugDuration(4250), '4.25s');
assert.equal(formatChugStatusLabel('unverified'), 'Unverified');
assert.equal(formatChugStatusLabel('verified'), 'Verified');
assert.equal(formatChugStatusLabel('rejected'), 'Rejected');
assert.equal(formatChugStatusLabel('expired'), 'Expired');

const attempts = [
  { id: 'slow', sessionId: 's1', status: 'verified', durationMs: 6200, requiredVolume: '33cl', containerType: 'bottle' },
  { id: 'bad', sessionId: 's1', status: 'rejected', durationMs: 3000, requiredVolume: '33cl', containerType: 'bottle' },
  { id: 'fast', sessionId: 's1', status: 'unverified', durationMs: 4100, requiredVolume: '33cl', containerType: 'bottle' },
];

assert.equal(getFastestVisibleChugAttempt(attempts).id, 'fast');
assert.equal(getChugStatSubtitle(attempts[2]), '33cl bottle - Unverified');

const pendingAttempt = {
  id: 'pending',
  sessionId: 's1',
  status: 'unverified',
  timingSource: 'pending_manual',
  durationMs: null,
};
const expiredAttempt = {
  id: 'expired',
  sessionId: 's1',
  status: 'expired',
  timingSource: 'ai',
  durationMs: 3500,
};

assert.equal(getVisibleChugStat([expiredAttempt]).kind, 'expired');
assert.equal(getVisibleChugStat([expiredAttempt, pendingAttempt]).kind, 'pending_manual');
assert.equal(getVisibleChugStat([expiredAttempt, pendingAttempt, ...attempts]).kind, 'timed');
assert.equal(getFastestVisibleChugAttempt([expiredAttempt, ...attempts]).id, 'fast');

assert.deepEqual(
  mapChugAttemptRow({
    id: 'row-1',
    session_id: 'session-1',
    session_beer_id: 'beer-1',
    user_id: 'user-1',
    verifier_user_id: 'verifier-1',
    status: 'verified',
    duration_ms: 5123,
    confidence_score: 0.86,
    detected_start_ms: 1200,
    detected_end_ms: 6323,
    container_type: 'bottle',
    required_volume: '33cl',
    created_at: '2026-06-01T12:00:00Z',
    verified_at: '2026-06-01T12:03:00Z',
    beer_name: 'Tuborg Gron',
  }),
  {
    id: 'row-1',
    sessionId: 'session-1',
    sessionBeerId: 'beer-1',
    userId: 'user-1',
    verifierUserId: 'verifier-1',
    status: 'verified',
    durationMs: 5123,
    confidenceScore: 0.86,
    detectedStartMs: 1200,
    detectedEndMs: 6323,
    containerType: 'bottle',
    requiredVolume: '33cl',
    timingSource: 'ai',
    expiresAt: null,
    createdAt: '2026-06-01T12:00:00Z',
    verifiedAt: '2026-06-01T12:03:00Z',
    beerName: 'Tuborg Gron',
  }
);

assert.deepEqual(
  mapChugAttemptRow({
    id: 'pending-row',
    session_id: 'session-1',
    session_beer_id: 'beer-1',
    status: 'unverified',
    duration_ms: null,
    timing_source: 'pending_manual',
    expires_at: '2026-06-02T12:00:00Z',
  }),
  {
    id: 'pending-row',
    sessionId: 'session-1',
    sessionBeerId: 'beer-1',
    userId: null,
    verifierUserId: null,
    status: 'unverified',
    durationMs: null,
    confidenceScore: null,
    detectedStartMs: null,
    detectedEndMs: null,
    containerType: 'bottle',
    requiredVolume: '33cl',
    timingSource: 'pending_manual',
    expiresAt: '2026-06-02T12:00:00Z',
    createdAt: null,
    verifiedAt: null,
    beerName: null,
  }
);

console.log('chug attempt helper checks passed');
