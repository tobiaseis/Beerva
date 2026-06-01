const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

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

const { getNotificationMessage } = loadTypeScriptModule('src/lib/notificationMessages.ts');

assert.equal(
  getNotificationMessage({ type: 'chug_verification', metadata: { duration_ms: 4800, beer_name: 'Tuborg Gron' } }),
  ' wants you to verify a 33cl bottle chug.'
);

const rootNavigatorSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/navigation/RootNavigator.tsx'), 'utf8');
assert.match(rootNavigatorSource, /ChugVerificationScreen/, 'root navigator should register chug verification screen');
assert.match(rootNavigatorSource, /getChugVerificationLaunchParamsFromUrl/, 'root navigator should parse chug verification launch params');

const notificationsScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/NotificationsScreen.tsx'), 'utf8');
assert.match(notificationsScreenSource, /chug_verification/, 'notifications screen should know the chug verification type');
assert.match(notificationsScreenSource, /openChugVerification/, 'notifications screen should route chug verification notifications');

const pushSource = fs.readFileSync(path.resolve(__dirname, '..', 'supabase/functions/send-push/index.ts'), 'utf8');
assert.match(pushSource, /chug_verification/, 'push function should support chug verification notifications');
assert.match(pushSource, /chug_verification=1/, 'push URL should deep-link to chug verification review');

console.log('chug notification checks passed');
