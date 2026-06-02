const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const helperPath = path.join(root, 'src/lib/pushReminderPrompt.ts');
assert.ok(fs.existsSync(helperPath), 'push reminder helper should exist');

const {
  PUSH_REMINDER_SEEN_KEY_PREFIX,
  getPushReminderSeenKey,
  hasSeenPushReminder,
  rememberPushReminderSeen,
  shouldShowPushReminder,
} = loadTypeScriptModule('src/lib/pushReminderPrompt.ts');

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

assert.equal(
  PUSH_REMINDER_SEEN_KEY_PREFIX,
  'beerva.pushReminder.seen',
  'push reminder should use a stable Beerva-specific localStorage key prefix'
);

assert.equal(
  getPushReminderSeenKey('user-1'),
  'beerva.pushReminder.seen.user-1',
  'push reminder seen keys should be scoped by user id'
);

assert.equal(
  getPushReminderSeenKey(' user-2 '),
  'beerva.pushReminder.seen.user-2',
  'push reminder seen keys should trim user ids'
);

{
  const storage = createStorage();
  assert.equal(hasSeenPushReminder(storage, 'user-1'), false, 'new users should not be marked seen');
  rememberPushReminderSeen(storage, 'user-1');
  assert.equal(hasSeenPushReminder(storage, 'user-1'), true, 'remembering should mark that user seen');
  assert.equal(hasSeenPushReminder(storage, 'user-2'), false, 'seen state should not leak across users');
}

{
  const storage = createStorage();
  const baseInput = {
    userId: 'user-1',
    support: { supported: true },
    permission: 'default',
    subscribed: false,
    storage,
  };

  assert.equal(
    shouldShowPushReminder(baseInput),
    true,
    'supported unsubscribed users who have not seen the reminder should qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, subscribed: true }),
    false,
    'subscribed users should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, support: { supported: false } }),
    false,
    'unsupported push environments should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, permission: 'denied' }),
    false,
    'denied browser notification permission should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, permission: 'unsupported' }),
    false,
    'unsupported notification permission should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, userId: null }),
    false,
    'missing signed-in users should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, storage: null }),
    false,
    'unavailable localStorage should not show a one-time prompt'
  );

  rememberPushReminderSeen(storage, 'user-1');
  assert.equal(
    shouldShowPushReminder(baseInput),
    false,
    'users who have already seen the reminder should not qualify again'
  );
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['test:push-reminder'],
  'node scripts/pushReminderPrompt.test.js',
  'package script should run the push reminder checks'
);

console.log('push reminder helper checks passed');
