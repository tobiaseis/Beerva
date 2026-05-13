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

const createSupabaseMock = (expectedCategory) => {
  const calls = {
    insertedPub: null,
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
          calls.insertedPub = payload;
          assert.equal(payload.place_category, expectedCategory);
          return builder;
        },
        select: (columns) => {
          calls.selectColumns = columns;
          return builder;
        },
        single: async () => ({
          data: {
            id: 'pub-1',
            name: calls.insertedPub.name,
            city: null,
            address: null,
            latitude: calls.insertedPub.latitude,
            longitude: calls.insertedPub.longitude,
            source: calls.insertedPub.source,
            source_id: null,
            use_count: 0,
            place_category: calls.insertedPub.place_category,
          },
          error: null,
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
  assert.equal(otherMock.calls.insertedPub.name, 'Backyard Bar');
  assert.equal(otherMock.calls.insertedPub.source, 'user');
  assert.equal(otherMock.calls.insertedPub.status, 'active');
  assert.equal(otherMock.calls.insertedPub.created_by, 'user-1');
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
  assert.equal(pubMock.calls.insertedPub.place_category, 'pub');
};

run()
  .then(() => {
    console.log('pub directory tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
