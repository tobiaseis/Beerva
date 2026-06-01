const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const waitForServer = (child) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('serve-dist did not start in time'));
  }, 5000);

  child.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('Beerva web preview:')) {
      clearTimeout(timeout);
      resolve();
    }
  });

  child.once('exit', (code) => {
    clearTimeout(timeout);
    reject(new Error(`serve-dist exited early with code ${code}`));
  });
});

const request = (port, pathname, accept = '*/*') => new Promise((resolve, reject) => {
  http.get({
    hostname: '127.0.0.1',
    port,
    path: pathname,
    headers: { Accept: accept },
  }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      body += chunk;
    });
    response.on('end', () => {
      resolve({ statusCode: response.statusCode, body });
    });
  }).on('error', reject);
});

(async () => {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['scripts/serve-dist.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child);

    const missingBundle = await request(port, '/_expo/static/js/web/missing-bundle.js');
    assert.equal(missingBundle.statusCode, 404, 'missing JS bundles should return 404, not the app shell');
    assert.doesNotMatch(missingBundle.body, /<script/i, 'missing JS responses should not contain index.html');

    const appRoute = await request(port, '/feed/session/123', 'text/html');
    assert.equal(appRoute.statusCode, 200, 'SPA routes should still fall back to index.html');
    assert.match(appRoute.body, /<div id="root"><\/div>/, 'SPA fallback should serve the app shell');

    console.log('serve-dist routing checks passed');
  } finally {
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
