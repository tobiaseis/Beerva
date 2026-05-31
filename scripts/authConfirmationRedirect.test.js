const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'public/auth-confirmed.html'),
  'utf8'
);

const scriptMatch = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(scriptMatch, 'Auth confirmation page should include redirect script');
assert.doesNotMatch(
  source,
  /id="countdown"/,
  'Auth confirmation page should not render a visible countdown value'
);
assert.match(
  source,
  /redirected shortly/,
  'Auth confirmation page should tell users they will be redirected shortly'
);
assert.match(
  source,
  /id="continue-link"/,
  'Auth confirmation page should render a manual continue link'
);

const elements = {
  'continue-link': { href: '' },
};
const timeouts = [];
const replacedUrls = [];

const sandbox = {
  document: {
    getElementById(id) {
      return elements[id] || null;
    },
  },
  window: {
    location: {
      search: '?code=signup-confirmation-code',
      hash: '#access_token=session-token',
      replace(url) {
        replacedUrls.push(url);
      },
    },
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
      return timeouts.length;
    },
  },
};
sandbox.globalThis = sandbox;

vm.runInNewContext(scriptMatch[1], sandbox);

assert.equal(
  elements['continue-link'].href,
  '/?code=signup-confirmation-code#access_token=session-token',
  'Manual continue link should preserve Supabase auth query and hash'
);
assert.equal(timeouts.length, 1, 'Confirmation page should schedule one automatic redirect');
assert.equal(timeouts[0].delay, 5000, 'Automatic redirect should wait five seconds');

timeouts[0].callback();

assert.deepEqual(
  replacedUrls,
  ['/?code=signup-confirmation-code#access_token=session-token'],
  'Automatic redirect should send the user back to the app with auth data intact'
);

console.log('auth confirmation redirect checks passed');
