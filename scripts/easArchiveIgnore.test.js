const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignorePath = path.join(root, '.easignore');
assert.ok(fs.existsSync(ignorePath), '.easignore should exist to keep local tooling out of EAS archives');

const ignoreLines = fs.readFileSync(ignorePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:eas-archive-ignore'],
  'node scripts/easArchiveIgnore.test.js',
  'package script should run EAS archive ignore checks'
);

for (const pattern of [
  '.agents/',
  '.claude/',
  '.superpowers/',
  '.expo/',
  'dist/',
  'node_modules/',
  'tmp/',
]) {
  assert.ok(ignoreLines.includes(pattern), `.easignore should exclude ${pattern}`);
}

console.log('EAS archive ignore checks passed');
