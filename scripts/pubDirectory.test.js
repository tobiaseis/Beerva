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
    searchArgs: null,
    createArgs: null,
    rawPubInsertAttempted: false,
  };

  const supabase = {
    rpc: async (name, args) => {
      if (name === 'search_pubs') {
        calls.searchArgs = args;
        return { data: [], error: null };
      }

      assert.equal(name, 'create_user_pub');
      calls.createArgs = args;
      assert.equal(args.target_place_category, expectedCategory);
      return {
        data: [{
          id: 'pub-1',
          name: args.target_name,
          city: null,
          address: null,
          latitude: args.target_lat,
          longitude: args.target_lon,
          source: 'user',
          source_id: null,
          use_count: 0,
          place_category: args.target_place_category,
          distance_meters: null,
        }],
        error: null,
      };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table) => {
      assert.equal(table, 'pubs');
      calls.rawPubInsertAttempted = true;
      throw new Error('createUserPub should use create_user_pub RPC, not a raw pubs insert');
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
  assert.equal(otherMock.calls.createArgs.target_name, 'Backyard Bar');
  assert.equal(otherMock.calls.createArgs.target_lat, 57.04);
  assert.equal(otherMock.calls.createArgs.target_lon, 9.92);
  assert.equal(otherMock.calls.createArgs.target_place_category, 'other');
  assert.equal(otherMock.calls.rawPubInsertAttempted, false);
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
  assert.equal(pubMock.calls.createArgs.target_place_category, 'pub');
};

run()
  .then(() => {
    console.log('pub directory tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
