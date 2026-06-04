const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260604130000_add_live_mate_sessions.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

const loadTypeScriptModule = (relativePath, mocks = {}) => {
  const filename = path.join(root, relativePath);
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

assert.match(migrationSql, /create table if not exists public\.live_mate_sessions/, 'migration should create live_mate_sessions');
assert.match(migrationSql, /session_id uuid not null references public\.sessions\(id\) on delete cascade/, 'live rows should point at the active session or crawl stop');
assert.match(migrationSql, /pub_crawl_id uuid references public\.pub_crawls\(id\) on delete cascade/, 'live rows should optionally point at an active pub crawl');
assert.match(migrationSql, /true_pints double precision not null default 0/, 'live rows should cache true-pint progress');
assert.match(migrationSql, /constraint live_mate_sessions_user_unique unique \(user_id\)/, 'a user should have at most one live row');
assert.match(migrationSql, /constraint live_mate_sessions_session_unique unique \(session_id\)/, 'a session should have at most one live row');
assert.match(migrationSql, /live_mate_sessions_last_activity_idx/, 'live rows should be indexed by latest activity');
assert.match(migrationSql, /alter table public\.live_mate_sessions enable row level security/, 'live rows should enable RLS');
assert.match(migrationSql, /follows\.follower_id = \(select auth\.uid\(\)\)[\s\S]*follows\.following_id = live_mate_sessions\.user_id/, 'direct select policy should be follower-aware');
assert.match(migrationSql, /alter publication supabase_realtime add table public\.live_mate_sessions/, 'live rows should be added to the realtime publication');
assert.match(migrationSql, /create or replace function public\.get_live_session_true_pints/, 'migration should add normal-session true-pint helper');
assert.match(migrationSql, /public\.beerva_serving_volume_ml\(session_beers\.volume\)/, 'true-pint helper should use the shared serving volume parser');
assert.match(migrationSql, /\/ 568\.0/, 'true-pint helper should normalize to Beerva true pints');
assert.match(migrationSql, /round\([^;]+::numeric,\s*1\)::double precision/, 'true-pint helper should round to one decimal');
assert.match(migrationSql, /create or replace function public\.get_live_pub_crawl_true_pints/, 'migration should add crawl true-pint helper');
assert.match(migrationSql, /create or replace function public\.refresh_live_mate_session_for_session/, 'session refresh function should exist');
assert.match(migrationSql, /create or replace function public\.refresh_live_mate_session_for_pub_crawl/, 'pub crawl refresh function should exist');
assert.match(migrationSql, /create or replace function public\.repair_live_mate_sessions/, 'repair function should exist');
assert.match(migrationSql, /create or replace function public\.get_live_mate_sessions\(\)/, 'viewer RPC should exist');
assert.match(migrationSql, /security definer/g, 'live functions should use security definer where needed');
assert.match(migrationSql, /grant execute on function public\.get_live_mate_sessions\(\) to authenticated/, 'authenticated users should execute the viewer RPC');
assert.match(migrationSql, /revoke execute on function public\.repair_live_mate_sessions\(\) from public, anon, authenticated/, 'clients should not execute the repair function');
assert.match(migrationSql, /create trigger sessions_live_mate_refresh/, 'sessions trigger should maintain live rows');
assert.match(migrationSql, /create trigger session_beers_live_mate_refresh/, 'session_beers trigger should maintain true-pint totals');
assert.match(migrationSql, /create trigger pub_crawls_live_mate_refresh/, 'pub_crawls trigger should maintain crawl rows');
assert.match(migrationSql, /select public\.repair_live_mate_sessions\(\);/, 'migration should backfill current active live rows');

console.log('live mate database checks passed');
