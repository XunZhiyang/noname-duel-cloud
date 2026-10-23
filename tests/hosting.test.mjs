import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { startHosting } from '../scripts/server.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamDir = path.join(workspace, 'noname');
const require = createRequire(path.join(upstreamDir, 'packages/server/package.json'));
const { WebSocket } = require('ws');
let fixture, gameDir, hosting;

before(async () => {
  fixture = await mkdtemp(path.join(tmpdir(), 'noname-hosting-test-'));
  gameDir = path.join(fixture, 'dist');
  await mkdir(path.join(gameDir, 'card'), { recursive: true });
  await mkdir(path.join(gameDir, 'node_modules', '.pnpm', 'fixture'), { recursive: true });
  await writeFile(path.join(gameDir, 'index.html'), '<!doctype html><title>Original game fixture</title>');
  await writeFile(path.join(gameDir, 'noname.js'), 'export const original = true;');
  await writeFile(path.join(gameDir, 'card', 'standard.js'), 'export default "standard";');
  await writeFile(path.join(gameDir, 'node_modules', '.pnpm', 'fixture', 'index.js'), 'export const dependency = true;');
  await writeFile(path.join(gameDir, '.env'), 'PRIVATE_CONFIGURATION');
  await writeFile(path.join(fixture, 'outside.txt'), 'PRIVATE_OUTSIDE_DISTRIBUTION');
  await symlink(path.join(fixture, 'outside.txt'), path.join(gameDir, 'escape.txt'));
  await symlink(fixture, path.join(gameDir, 'escape-dir'));
  hosting = await startHosting({ upstreamDir, gameDir, port: 0, host: '127.0.0.1' });
});

after(async () => { await hosting?.close(); if (fixture) await rm(fixture, { recursive: true, force: true }); });

function rawRequest(target, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: hosting.port, path: target, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject); request.end();
  });
}

test('serves the original distribution and a health endpoint', async () => {
  const page = await fetch(`${hosting.url}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Original game fixture/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${hosting.url}/healthz`)).status, 200);
  const dependency = await fetch(`${hosting.url}/node_modules/.pnpm/fixture/index.js`);
  assert.equal(dependency.status, 200);
  assert.match(await dependency.text(), /dependency/);
  assert.equal((await fetch(`${hosting.url}/scripts/server.mjs`)).status, 404);
});

test('preserves upstream file API response formats', async () => {
  const check = await fetch(`${hosting.url}/checkFile?fileName=noname.js`).then(response => response.json());
  assert.deepEqual(check, { success: true, code: 200, data: 'file' });
  const missing = await fetch(`${hosting.url}/checkFile?fileName=noname.config.txt`).then(response => response.json());
  assert.deepEqual(missing, { success: true, code: 200, data: {} });
  const text = await fetch(`${hosting.url}/readFileAsText?fileName=card%2Fstandard.js`).then(response => response.json());
  assert.equal(text.data, 'export default "standard";');
  const bytes = await fetch(`${hosting.url}/readFile?fileName=noname.js`).then(response => response.json());
  assert.equal(Buffer.from(bytes.data).toString(), 'export const original = true;');
  const list = await fetch(`${hosting.url}/getFileList?dir=card`).then(response => response.json());
  assert.deepEqual(list.data, { folders: [], files: ['standard.js'] });
  const rootList = await fetch(`${hosting.url}/getFileList?dir=.`).then(response => response.json());
  assert.equal(rootList.success, true);
});

test('rejects mutation routes, methods, and encoded variants without changing files', async () => {
  for (const target of ['/removeFile?fileName=noname.js', '/removeDir?dir=card', '/createDir?dir=unwanted', '/%72emoveFile?fileName=noname.js', '/removeFile/?fileName=noname.js']) {
    assert.equal((await rawRequest(target)).status, 403, target);
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    assert.equal((await rawRequest('/writeFile', method)).status, 405, method);
  }
  assert.equal(await readFile(path.join(gameDir, 'noname.js'), 'utf8'), 'export const original = true;');
});

test('blocks traversal, dotfiles, outside symlinks, and ambiguous file queries', async () => {
  const forbidden = [
    '/../outside.txt', '/%2e%2e/outside.txt', '/%252e%252e/outside.txt', '/.env',
    '/escape.txt', '/escape-dir/outside.txt', '/escape-dir/not-created-yet.txt',
    '/readFile?fileName=..%2Foutside.txt', '/readFile?fileName=%2Fetc%2Fpasswd',
    '/readFile?fileName=escape.txt', '/readFile?fileName=.%2F.env',
    '/readFile?fileName=card%5C..%5C..%5Coutside.txt', '/readFile?fileName=%252e%252e%252Foutside.txt',
    '/getFileList?dir=escape-dir',
  ];
  for (const target of forbidden) {
    const response = await rawRequest(target);
    assert.equal(response.status, 403, target);
    assert.doesNotMatch(response.body, /PRIVATE_|\/private\//, target);
  }
  assert.equal((await rawRequest('/readFile?fileName=noname.js&fileName=.env')).status, 400);
  assert.equal((await rawRequest('/readFile')).status, 400);
});

test('forwards the original WebSocket lobby protocol over the same origin', async () => {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(hosting.url.replace('http:', 'ws:') + '/');
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error('Original lobby did not answer')); }, 4000);
    socket.once('error', error => { clearTimeout(timeout); reject(error); });
    socket.once('message', raw => {
      try {
        const message = JSON.parse(raw);
        assert.equal(message[0], 'roomlist');
        assert.equal(message.length, 5);
        assert.ok(Array.isArray(message[1]));
        assert.equal(typeof message[4], 'string');
        socket.send(JSON.stringify(['server', 'key', ['hosting-test-client', '1.11.7']]));
        clearTimeout(timeout); socket.close(); resolve();
      } catch (error) { clearTimeout(timeout); socket.terminate(); reject(error); }
    });
  });
});

async function openProtocolClient() {
  const socket = new WebSocket(hosting.url.replace('http:', 'ws:') + '/');
  const messages = [];
  const waiters = [];
  socket.on('message', raw => {
    if (raw.toString() === 'heartbeat') { socket.send('heartbeat'); return; }
    const message = JSON.parse(raw);
    const index = waiters.findIndex(waiter => waiter.match(message));
    if (index === -1) messages.push(message);
    else { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
  });
  socket.on('close', () => {
    for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error('Client disconnected before the expected protocol message')); }
  });
  await once(socket, 'open');
  return {
    send(message) { socket.send(JSON.stringify(message)); },
    receive(match) {
      const index = messages.findIndex(match);
      if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve, reject };
        waiter.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error('Timed out waiting for native lobby protocol message'));
        }, 4000);
        waiters.push(waiter);
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, 'close');
      socket.close();
      const timeout = setTimeout(() => socket.terminate(), 1000);
      await closed;
      clearTimeout(timeout);
    },
  };
}

test('two native clients create, join, relay game messages, and clean up a room', async t => {
  const host = await openProtocolClient();
  const guest = await openProtocolClient();
  t.after(async () => { await Promise.all([host.close(), guest.close()]); });
  const hostHello = await host.receive(message => message[0] === 'roomlist');
  const guestHello = await guest.receive(message => message[0] === 'roomlist');
  const roomKey = 'native-integration-room';
  const guestId = guestHello[4];
  assert.notEqual(hostHello[4], guestId);

  host.send(['server', 'key', [roomKey, '1.11.7']]);
  guest.send(['server', 'key', ['native-integration-guest', '1.11.7']]);
  host.send(['server', 'create', roomKey, '房主', 'caocao', {}, 'single']);
  assert.deepEqual(await host.receive(message => message[0] === 'createroom'), ['createroom', roomKey]);
  host.send(['server', 'config', { mode: 'single', number: 2, gameStarted: false }]);
  const listed = await guest.receive(message => message[0] === 'updaterooms' && message[1].some(room => room[4] === roomKey));
  assert.equal(listed[1].find(room => room[4] === roomKey)[0], '房主');

  guest.send(['server', 'enter', roomKey, '来客', 'zhaoyun']);
  assert.deepEqual(await host.receive(message => message[0] === 'onconnection'), ['onconnection', guestId]);

  // The wrapper must preserve both strings byte-for-byte; it owns no game protocol.
  const fromGuest = ['game-test', { card: 'sha', seat: 1, text: '中文响应' }];
  guest.send(fromGuest);
  const relayed = await host.receive(message => message[0] === 'onmessage');
  assert.equal(relayed[1], guestId);
  assert.equal(relayed[2], JSON.stringify(fromGuest));
  const fromHost = ['game-test-result', { accepted: true, hp: 3 }];
  host.send(['server', 'send', guestId, JSON.stringify(fromHost)]);
  assert.deepEqual(await guest.receive(message => message[0] === 'game-test-result'), fromHost);

  await guest.close();
  assert.deepEqual(await host.receive(message => message[0] === 'onclose'), ['onclose', guestId]);
  await host.close();

  // A fresh native lobby observer confirms the departed host's room was removed.
  const observer = await openProtocolClient();
  t.after(() => observer.close());
  const afterDisconnect = await observer.receive(message => message[0] === 'roomlist');
  assert.equal(afterDisconnect[1].some(room => room[4] === roomKey), false);
  observer.send(['server', 'key', ['native-integration-observer', '1.11.7']]);
});

test('rejects WebSocket upgrades on non-lobby routes', async () => {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(hosting.url.replace('http:', 'ws:') + '/writeFile');
    socket.once('open', () => { socket.terminate(); reject(new Error('Unexpected accepted upgrade')); });
    socket.once('unexpected-response', (_request, response) => {
      try { assert.equal(response.statusCode, 403); response.resume(); socket.terminate(); resolve(); } catch (error) { reject(error); }
    });
    socket.on('error', () => {});
  });
});
