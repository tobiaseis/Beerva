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
