const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const mentions = loadTypeScriptModule('src/lib/mentions.ts');

assert.deepEqual(
  mentions.getActiveMentionTrigger('hello @ma', 9),
  { start: 6, end: 9, query: 'ma' },
  'active mention trigger should read the query after @'
);

assert.equal(
  mentions.getActiveMentionTrigger('email test@example.com', 18),
  null,
  'mention trigger should ignore @ inside words or email addresses'
);

assert.deepEqual(
  mentions.insertMentionAtTrigger('hello @ma', 9, { id: 'u1', username: 'Mads Mikkelsen', avatarUrl: null }),
  {
    text: 'hello @Mads Mikkelsen ',
    cursor: 22,
    mention: { userId: 'u1', label: '@Mads Mikkelsen' },
  },
  'insert should replace the active query with the selected display name'
);

assert.deepEqual(
  mentions.sanitizeMentionCandidates('hello @Mads Mikkelsen and @Line', [
    { userId: 'u1', label: '@Mads Mikkelsen' },
    { userId: 'u1', label: '@Mads Mikkelsen' },
    { userId: 'u2', label: '@Line' },
    { userId: 'u3', label: '@Deleted' },
  ]),
  [
    { userId: 'u1', label: '@Mads Mikkelsen' },
    { userId: 'u2', label: '@Line' },
  ],
  'sanitize should keep selected labels still present in text and dedupe users'
);

assert.deepEqual(
  mentions.toMentionRpcPayload('hello @Mads Mikkelsen', [
    { userId: 'u1', label: '@Mads Mikkelsen' },
    { userId: 'u2', label: '@Deleted' },
  ]),
  [{ userId: 'u1', label: '@Mads Mikkelsen' }],
  'RPC payload should contain only selected mentions still present in text'
);

const mentionMigrationPath = path.join(root, 'supabase/migrations/20260604140000_add_content_mentions.sql');
assert.equal(fs.existsSync(mentionMigrationPath), true, 'content mentions migration should exist');

const mentionSql = fs.existsSync(mentionMigrationPath)
  ? fs.readFileSync(mentionMigrationPath, 'utf8')
  : '';

assert.match(mentionSql, /create table if not exists public\.content_mentions/i, 'migration should create content_mentions');
assert.match(mentionSql, /mentioned_user_id uuid not null references auth\.users\(id\) on delete cascade/i, 'mentions should reference mentioned users');
assert.match(mentionSql, /actor_id uuid not null references auth\.users\(id\) on delete cascade/i, 'mentions should reference actors');
assert.match(mentionSql, /target_type text not null/i, 'mentions should store typed post targets');
assert.match(mentionSql, /surface text not null/i, 'mentions should store post or comment surface');
assert.match(mentionSql, /unique index if not exists content_mentions_user_source_idx/i, 'mentions should dedupe per mentioned user and source');
assert.match(mentionSql, /alter table public\.content_mentions enable row level security/i, 'mentions should enable RLS');
assert.match(mentionSql, /create or replace function public\.create_content_mentions/i, 'migration should create the mention RPC');
assert.match(mentionSql, /security definer/i, 'mention RPC should run as definer');
assert.match(mentionSql, /jsonb_array_length\(mention_candidates\) > 10/i, 'mention RPC should cap mention candidates');
assert.match(mentionSql, /insert into public\.notifications[\s\S]*'mention'/i, 'mention RPC should insert mention notifications');
assert.match(mentionSql, /target_owner_id is null[\s\S]*target_owner_id <> inserted_mention\.mentioned_user_id/i, 'mention RPC should skip duplicate comment-owner notifications');
assert.match(mentionSql, /grant execute on function public\.create_content_mentions/i, 'authenticated users should execute mention RPC');
assert.match(mentionSql, /notify pgrst, 'reload schema'/i, 'migration should reload PostgREST schema');

const rpcCalls = [];
const mentionNotifications = loadTypeScriptModule('src/lib/mentionNotifications.ts', {
  './supabase': {
    supabase: {
      rpc(name, payload) {
        rpcCalls.push([name, payload]);
        return Promise.resolve({ data: 2, error: null });
      },
    },
  },
  './mentions': mentions,
});

mentionNotifications.notifyContentMentions({
  targetType: 'pub_crawl',
  targetId: 'crawl-1',
  surface: 'comment',
  sourceId: 'comment-1',
  text: 'hello @Line and @Mads Mikkelsen',
  mentions: [
    { userId: 'u2', label: '@Line' },
    { userId: 'u3', label: '@Mads Mikkelsen' },
    { userId: 'u4', label: '@Missing' },
  ],
}).then((createdCount) => {
  assert.equal(createdCount, 2, 'mention notification helper should return RPC count');
  assert.deepEqual(
    rpcCalls[0],
    [
      'create_content_mentions',
      {
        target_type_input: 'pub_crawl',
        target_id_input: 'crawl-1',
        surface_input: 'comment',
        source_id_input: 'comment-1',
        mention_candidates: [
          { userId: 'u2', label: '@Line' },
          { userId: 'u3', label: '@Mads Mikkelsen' },
        ],
      },
    ],
    'mention notification helper should call RPC with sanitized selected mentions'
  );
});

const mentionComposerPath = path.join(root, 'src/components/MentionComposer.tsx');
assert.equal(fs.existsSync(mentionComposerPath), true, 'mention composer component should exist');

const mentionComposerSource = fs.existsSync(mentionComposerPath)
  ? fs.readFileSync(mentionComposerPath, 'utf8')
  : '';

assert.match(mentionComposerSource, /getActiveMentionTrigger/, 'mention composer should detect active @ queries');
assert.match(mentionComposerSource, /searchMentionProfiles/, 'mention composer should search profiles');
assert.match(mentionComposerSource, /insertMentionAtTrigger/, 'mention composer should insert selected mentions');
assert.match(mentionComposerSource, /onMentionsChange/, 'mention composer should expose selected mention state');
assert.match(mentionComposerSource, /limit\(8\)|searchMentionProfiles\([^)]*8/s, 'mention composer should use the eight-result search behavior');

const feedScreenSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
assert.match(feedScreenSource, /MentionComposer/, 'feed comment modal should use MentionComposer');
assert.match(feedScreenSource, /commentMentions/, 'feed should track selected comment mentions');
assert.match(feedScreenSource, /notifyContentMentionsSafely\(\{[\s\S]*surface:\s*'comment'/, 'feed comments should create comment mention notifications');
assert.match(feedScreenSource, /targetType:\s*'pub_crawl'/, 'feed should create pub crawl mention targets');
assert.match(feedScreenSource, /targetType:\s*'session'/, 'feed should create session mention targets');

const postDetailSource = fs.readFileSync(path.join(root, 'src/screens/PostDetailScreen.tsx'), 'utf8');
assert.match(postDetailSource, /MentionComposer/, 'post detail comment composer should use MentionComposer');
assert.match(postDetailSource, /commentMentions/, 'post detail should track selected comment mentions');
assert.match(postDetailSource, /notifyContentMentionsSafely\(\{[\s\S]*surface:\s*'comment'/, 'post detail comments should create comment mention notifications');

const recordScreenSource = fs.readFileSync(path.join(root, 'src/screens/RecordScreen.tsx'), 'utf8');
assert.match(recordScreenSource, /MentionComposer/, 'record caption input should use MentionComposer');
assert.match(recordScreenSource, /postMentions/, 'record screen should track selected post mentions');
assert.match(recordScreenSource, /surface:\s*'post'/, 'record screen should create post mention notifications');
assert.match(recordScreenSource, /targetType:\s*activeCrawl \? 'pub_crawl' : 'session'/, 'record screen should use pub crawl targets for crawl stop captions');

const saveActiveStart = recordScreenSource.indexOf('const saveActiveSessionComment');
const saveActiveEnd = recordScreenSource.indexOf('useEffect(() => {', saveActiveStart);
const saveActiveBody = saveActiveStart >= 0 && saveActiveEnd > saveActiveStart
  ? recordScreenSource.slice(saveActiveStart, saveActiveEnd)
  : recordScreenSource;
assert.doesNotMatch(saveActiveBody, /notifyContentMentionsSafely/, 'active caption autosave should not send mention notifications');

const pubCrawlsApiSource = fs.readFileSync(path.join(root, 'src/lib/pubCrawlsApi.ts'), 'utf8');
assert.match(pubCrawlsApiSource, /finishedStop/, 'pub crawl stop helper should expose the finished stop for mention notification source ids');

const calls = [];
const fakeSupabase = {
  from(table) {
    calls.push(['from', table]);
    return {
      select(columns) {
        calls.push(['select', columns]);
        return this;
      },
      ilike(column, pattern) {
        calls.push(['ilike', column, pattern]);
        return this;
      },
      neq(column, value) {
        calls.push(['neq', column, value]);
        return this;
      },
      order(column, options) {
        calls.push(['order', column, options]);
        return this;
      },
      limit(value) {
        calls.push(['limit', value]);
        return Promise.resolve({
          data: [
            { id: 'u2', username: 'Line', avatar_url: 'line.png' },
            { id: 'u3', username: 'Mads Mikkelsen', avatar_url: null },
          ],
          error: null,
        });
      },
    };
  },
};

mentions.searchMentionProfiles(fakeSupabase, 'ma', 'u1').then((profiles) => {
  assert.deepEqual(
    profiles,
    [
      { id: 'u2', username: 'Line', avatarUrl: 'line.png' },
      { id: 'u3', username: 'Mads Mikkelsen', avatarUrl: null },
    ],
    'profile search should normalize profile rows'
  );
  assert.deepEqual(
    calls,
    [
      ['from', 'profiles'],
      ['select', 'id, username, avatar_url'],
      ['ilike', 'username', '%ma%'],
      ['neq', 'id', 'u1'],
      ['order', 'username', { ascending: true }],
      ['limit', 8],
    ],
    'profile search should query indexed profile usernames and exclude current user'
  );
  console.log('mentions tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
