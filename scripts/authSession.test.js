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
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const makeSupabase = (session) => ({
  './supabase': {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        // Throw if anyone uses the network call instead of the cached session.
        getUser: async () => {
          throw new Error('authSession must not call auth.getUser()');
        },
      },
    },
  },
});

(async () => {
  const withUser = loadTypeScriptModule('src/lib/authSession.ts', makeSupabase({
    user: { id: 'user-123' },
  }));
  assert.equal(await withUser.getCurrentUserId(), 'user-123', 'returns cached session user id');
  const user = await withUser.getCurrentUser();
  assert.equal(user && user.id, 'user-123', 'returns cached session user');

  const noSession = loadTypeScriptModule('src/lib/authSession.ts', makeSupabase(null));
  assert.equal(await noSession.getCurrentUserId(), null, 'returns null when there is no session');
  assert.equal(await noSession.getCurrentUser(), null, 'returns null user when there is no session');

  const source = fs.readFileSync(path.join(root, 'src/lib/authSession.ts'), 'utf8');
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.match(codeOnly, /getSession\(\)/, 'helper should read the cached session');
  assert.doesNotMatch(codeOnly, /getUser\(\)/, 'helper should not call the getUser network method');

  console.log('auth session checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
