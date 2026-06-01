const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const noJekyllPath = path.join(root, '.nojekyll');

assert.ok(
  fs.existsSync(noJekyllPath),
  'GitHub Pages should bypass Jekyll so docs code samples with {{ ... }} are not parsed as Liquid'
);

assert.equal(
  fs.readFileSync(noJekyllPath, 'utf8').trim(),
  '',
  '.nojekyll should stay empty'
);

console.log('GitHub Pages Jekyll bypass check passed');
