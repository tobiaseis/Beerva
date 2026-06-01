const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = 'supabase/migrations/20260601160000_add_official_beerva_posts.sql';
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const migrationSql = exists(migrationPath) ? read(migrationPath) : '';

const loadTypeScriptModule = (relativePath) => {
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
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

assert.ok(exists(migrationPath), 'official posts migration should exist');
assert.match(migrationSql, /add column if not exists admin_request_key uuid/i, 'official posts should store retry keys');
assert.match(migrationSql, /add column if not exists linked_challenge_id uuid/i, 'official posts should store optional linked challenges');
assert.match(migrationSql, /add column if not exists image_url text/i, 'official posts should store one optional image');
assert.match(migrationSql, /official_feed_posts_admin_request_key_idx/i, 'official posts should index retry keys uniquely');
assert.match(migrationSql, /official_post_images/i, 'migration should create official post image storage');
assert.match(migrationSql, /Admins can upload their own official post images/i, 'official image uploads should require an admin folder policy');
assert.match(migrationSql, /alter column actor_id drop not null/i, 'official notifications should allow a null personal actor');
assert.match(migrationSql, /'official_post'/i, 'notifications should support official posts');
assert.match(migrationSql, /create or replace function public\.admin_get_official_posts\(\)/i, 'admins should list official posts');
assert.match(migrationSql, /create or replace function public\.admin_publish_official_post/i, 'admins should publish official posts');
assert.match(migrationSql, /if not public\.is_current_user_admin\(\)/i, 'publication should require an admin');
assert.match(migrationSql, /push notifications require in-app notifications/i, 'push should require in-app delivery');
assert.match(migrationSql, /where official_feed_posts\.admin_request_key = post_request_key/i, 'publication should reuse retry keys');
assert.match(migrationSql, /on conflict \(admin_request_key\)[\s\S]*do nothing/i, 'overlapping publication retries should converge on one post');
assert.match(migrationSql, /insert into public\.notifications/i, 'publication should fan out in-app notifications');
assert.match(migrationSql, /select profiles\.id/i, 'fan-out should create one row per profile');
assert.match(migrationSql, /'push_enabled'/i, 'fan-out should snapshot the push toggle');
assert.match(migrationSql, /notify pgrst,\s*'reload schema'/i, 'migration should refresh PostgREST schema');

console.log('official Beerva post checks passed');
