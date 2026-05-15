const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

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

const createSupabaseMock = (expectedCategory, options = {}) => {
  const calls = {
    insertedPubs: [],
    selectColumns: '',
    rpcArgs: null,
  };

  const supabase = {
    rpc: async (name, args) => {
      assert.equal(name, 'search_pubs');
      calls.rpcArgs = args;
      return { data: [], error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table) => {
      assert.equal(table, 'pubs');
      const builder = {
        insert: (payload) => {
          calls.insertedPubs.push(payload);
          if (!options.legacySchemaCacheError) {
            assert.equal(payload.place_category, expectedCategory);
          }
          return builder;
        },
        select: (columns) => {
          calls.selectColumns = columns;
          return builder;
        },
        single: async () => ({
          error: options.legacySchemaCacheError && calls.insertedPubs.length === 1
            ? { message: "Could not find the 'place_category' column of 'pubs' in the schema cache" }
            : null,
          data: {
            id: 'pub-1',
            name: calls.insertedPubs[calls.insertedPubs.length - 1].name,
            city: null,
            address: null,
            latitude: calls.insertedPubs[calls.insertedPubs.length - 1].latitude,
            longitude: calls.insertedPubs[calls.insertedPubs.length - 1].longitude,
            source: calls.insertedPubs[calls.insertedPubs.length - 1].source,
            source_id: null,
            use_count: 0,
            place_category: calls.insertedPubs[calls.insertedPubs.length - 1].place_category,
          },
        }),
      };
      return builder;
    },
  };

  return { supabase, calls };
};

const loadPubDirectory = (supabase) => loadTypeScriptModuleWithMocks('src/lib/pubDirectory.ts', {
  './supabase': { supabase },
});

const run = async () => {
  const otherMock = createSupabaseMock('other');
  const otherDirectory = loadPubDirectory(otherMock.supabase);
  const otherPub = await otherDirectory.createUserPub(
    'Backyard Bar',
    { latitude: 57.04, longitude: 9.92 },
    'other'
  );

  assert.equal(otherPub.place_category, 'other');
  assert.equal(otherMock.calls.insertedPubs[0].name, 'Backyard Bar');
  assert.equal(otherMock.calls.insertedPubs[0].source, 'user');
  assert.equal(otherMock.calls.insertedPubs[0].status, 'active');
  assert.equal(otherMock.calls.insertedPubs[0].created_by, 'user-1');
  assert.match(otherMock.calls.selectColumns, /place_category/);
  assert.equal(
    otherDirectory.formatPubDetail({
      address: null,
      distance_meters: null,
      source: 'user',
      place_category: 'other',
    }),
    'Other place / Added by Beerva'
  );

  const pubMock = createSupabaseMock('pub');
  const pubDirectory = loadPubDirectory(pubMock.supabase);
  const realPub = await pubDirectory.createUserPub('Real Pub', null);

  assert.equal(realPub.place_category, 'pub');
  assert.equal(pubMock.calls.insertedPubs[0].place_category, 'pub');

  const legacyMock = createSupabaseMock('other', { legacySchemaCacheError: true });
  const legacyDirectory = loadPubDirectory(legacyMock.supabase);
  const legacyPub = await legacyDirectory.createUserPub('CC crib', null, 'other');

  assert.equal(legacyMock.calls.insertedPubs.length, 2);
  assert.equal(legacyMock.calls.insertedPubs[0].place_category, 'other');
  assert.equal(
    Object.prototype.hasOwnProperty.call(legacyMock.calls.insertedPubs[1], 'place_category'),
    false,
    'legacy schema-cache fallback should retry without the missing place_category column'
  );
  assert.equal(legacyPub.place_category, 'other');
};

run()
  .then(() => {
    console.log('pub directory tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
