const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

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

const { streakToFlameTier, getFlameTierConfig, FLAME_TIERS } = loadTypeScriptModule('src/lib/streakFlame.ts');

// Tier boundaries
assert.equal(streakToFlameTier(0), 0);
assert.equal(streakToFlameTier(1), 0);
assert.equal(streakToFlameTier(2), 1);
assert.equal(streakToFlameTier(3), 1);
assert.equal(streakToFlameTier(4), 2);
assert.equal(streakToFlameTier(6), 2);
assert.equal(streakToFlameTier(7), 3);
assert.equal(streakToFlameTier(13), 3);
assert.equal(streakToFlameTier(14), 4);
assert.equal(streakToFlameTier(99), 4);

// Config: null below threshold, present at/above
assert.equal(getFlameTierConfig(1), null);
assert.equal(getFlameTierConfig(2).tier, 1);
assert.equal(getFlameTierConfig(14).tier, 4);

// Each defined tier carries the fields the component relies on
for (const t of [1, 2, 3, 4]) {
  const cfg = FLAME_TIERS[t];
  assert.ok(cfg.colors.core && cfg.colors.mid && cfg.colors.outer, `tier ${t} colors`);
  assert.ok(typeof cfg.flickerDurationMs === 'number' && cfg.flickerDurationMs > 0, `tier ${t} duration`);
  assert.ok(typeof cfg.scale === 'number' && cfg.scale > 0, `tier ${t} scale`);
}

console.log('streakFlame tier tests passed');

// --- Migration assertions ---
const migration = readSource('supabase/migrations/20260604150000_add_current_streaks.sql');

assert.match(migration, /create or replace function public\.get_current_streaks\(user_ids uuid\[\]\)/);
// Reuses the 6am Copenhagen drinking-day definition.
assert.match(migration, /timezone\('Europe\/Copenhagen'/);
assert.match(migration, /interval '6 hours'/);
// Active-window guard: most recent drinking day is today or yesterday.
assert.match(migration, /- 1\)\s*\n?\s*then/);
// Only published sessions count.
assert.match(migration, /status = 'published'/);
// Both read RPCs are redefined and reference the canonical function.
assert.match(migration, /create or replace function public\.get_profile_stats\(target_user_id uuid\)/);
assert.match(migration, /current_streak integer/);
assert.match(migration, /create or replace function public\.get_session_feed_details\(session_ids uuid\[\]\)/);
assert.match(migration, /author_current_streak integer/);
assert.ok((migration.match(/public\.get_current_streaks\(/g) || []).length >= 3,
  'get_current_streaks should be defined once and called from both read RPCs');
// Grants follow existing conventions.
assert.match(migration, /grant execute on function public\.get_current_streaks\(uuid\[\]\) to authenticated/);
assert.match(migration, /notify pgrst, 'reload schema'/);

console.log('streak migration assertions passed');

// --- StreakAvatar component assertions ---
const streakAvatar = readSource('src/components/StreakAvatar.tsx');

assert.match(streakAvatar, /import \{ CachedImage \} from '\.\/CachedImage'/);
assert.match(streakAvatar, /from '\.\.\/lib\/streakFlame'/);
assert.match(streakAvatar, /react-native-svg/);
assert.match(streakAvatar, /AccessibilityInfo/);
assert.match(streakAvatar, /isReduceMotionEnabled/);
// No-op below threshold: returns a plain CachedImage when there is no flame tier.
assert.match(streakAvatar, /getFlameTierConfig/);
// Count label is gated behind showCount.
assert.match(streakAvatar, /showCount/);
assert.match(streakAvatar, /day streak/);

console.log('StreakAvatar source assertions passed');
