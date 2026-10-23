/** Background-only check of the deployed game, classic duel modules, and a temporary room. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(workspace, 'noname/packages/server/package.json'));
const { WebSocket } = require('ws');
const milliseconds = start => Math.round(performance.now() - start);

async function openClient(url) {
  const socket = new WebSocket(url, { handshakeTimeout: 20_000 });
  const messages = [], waiters = [];
  socket.on('message', raw => {
    if (raw.toString() === 'heartbeat') { socket.send('heartbeat'); return; }
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const index = waiters.findIndex(waiter => waiter.match(message));
    if (index < 0) messages.push(message);
    else { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
  });
  const rejectPending = error => {
    for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); }
  };
  socket.on('error', rejectPending);
  socket.on('close', () => rejectPending(new Error('WebSocket closed before the expected lobby response')));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    send(message) { socket.send(JSON.stringify(message)); },
    receive(match) {
      const index = messages.findIndex(match);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve, reject };
        waiter.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error('Timed out after 20 seconds waiting for an original lobby message'));
        }, 20_000);
        waiters.push(waiter);
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      await new Promise(resolve => {
        const timer = setTimeout(() => { socket.terminate(); resolve(); }, 1500);
        socket.once('close', () => { clearTimeout(timer); resolve(); });
        socket.close();
      });
    },
  };
}

export async function smokeCloud(target) {
  const origin = new URL(target);
  assert.ok(['https:', 'http:'].includes(origin.protocol), 'Use an HTTP or HTTPS game URL');
  const report = { url: origin.origin, checkedAt: new Date().toISOString(), http: [], protocol: [], errors: [] };
  const total = performance.now();
  let version;
  const requests = [
    ['/healthz', text => assert.equal(JSON.parse(text).ok, true)],
    ['/index.html', text => { assert.match(text, /和电脑玩/); assert.match(text, /邀请另一人/); }],
    ['/', text => assert.match(text, /href="\/\?play=ai"/)],
    ['/?play=ai', text => assert.match(text, /<title>无名杀<\/title>/)],
    ['/?play=hall', text => assert.match(text, /<title>无名杀<\/title>/)],
    ['/additions/duel-entry.js', text => assert.match(text, /single_mode: 'biaofeng'/)],
    ['/game/update.js', text => { version = text.match(/version:\s*["']([^"']+)["']/)?.[1]; assert.ok(version, 'Missing original version'); report.version = version; }],
    ['/game/build-info.json', text => { const build = JSON.parse(text); assert.ok(build.commit); report.commit = build.commit; }],
    ['/mode/single.js', text => {
      assert.ok(text.length > 1000, 'Single-player mode bundle is unexpectedly small');
      assert.match(text, /installBiaofeng\(single\)/, 'Classic duel installer is missing');
    }],
    ['/preload.js', text => {
      assert.match(text, /registerBiaofengMenu\(context.lib, context.get\)/);
      assert.match(text, /registerQuickDuel\(context\)/);
      assert.match(text, /registerDuelEntry\(context\)/);
    }],
    ['/?quick=host', text => assert.match(text, /<title>无名杀<\/title>/)],
    ['/noname/init/index.js', text => { assert.match(text, /lib.quickDuel\?\.prepare\(\)/); assert.match(text, /lib.duelEntry\?\.prepare\(\)/); }],
    ['/additions/quick-duel.js', text => assert.match(text, /registerQuickDuel/)],
    ['/additions/quick-duel-view.js', text => assert.match(text, /createQuickDuelView/)],
    ['/additions/quick-duel.css', text => assert.ok(text.length > 100)],
    ['/additions/biaofeng-menu.js', text => assert.match(text, /标风 1v1/)],
    ['/additions/biaofeng-roster-menu.js', text => assert.match(text, /getBiaofengRoster/)],
    ['/additions/biaofeng-roster-menu.css', text => assert.match(text, /biaofeng-roster-mode/)],
    ['/noname/ui/create/menu/pages/characterPackMenu.js', text => assert.match(text, /attachBiaofengRosterMenu\(lib/)],
    ['/additions/biaofeng-data.js', text => assert.match(text, /BIAOFENG_PILE/)],
    ['/additions/biaofeng-single.js', text => assert.match(text, /installBiaofeng/)],
    ['/additions/biaofeng-skills.js', text => assert.ok(text.length > 100, 'Classic skill adaptations are missing')],
    ['/image/character/caocao.jpg', null],
    ['/image/card/sha.png', null],
  ];
  const results = await Promise.allSettled(requests.map(async ([pathname, validate]) => {
    const started = performance.now();
    const response = await fetch(new URL(pathname, origin), { signal: AbortSignal.timeout(45_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
    if (pathname.startsWith('/?')) assert.equal(response.redirected, false, `${pathname} must preserve its entry parameters`);
    if (validate) validate(bytes.toString('utf8'));
    else assert.ok(response.headers.get('content-type')?.startsWith('image/'), `${pathname} did not return an image`);
    report.http.push({ path: pathname, status: response.status, bytes: bytes.length, milliseconds: milliseconds(started) });
  }));
  results.forEach((result, index) => { if (result.status === 'rejected') report.errors.push(`${requests[index][0]}: ${result.reason.message}`); });
  if (report.errors.length) { report.ok = false; report.milliseconds = milliseconds(total); return report; }

  const websocket = new URL('/', origin); websocket.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const roomKey = `duel_${randomUUID().replaceAll('-', '')}`;
  const clients = [];
  const step = async (name, operation) => {
    const started = performance.now();
    await operation();
    report.protocol.push({ step: name, passed: true, milliseconds: milliseconds(started) });
  };
  try {
    let host, guest, guestId;
    await step('two_client_handshakes', async () => {
      host = await openClient(websocket); clients.push(host);
      const hostHello = await host.receive(message => message[0] === 'roomlist');
      assert.equal(hostHello.length, 5);
      host.send(['server', 'key', [roomKey, version]]);
      guest = await openClient(websocket); clients.push(guest);
      const guestHello = await guest.receive(message => message[0] === 'roomlist');
      guestId = guestHello[4];
      assert.equal(typeof guestId, 'string');
      guest.send(['server', 'key', [`${roomKey}-guest`, version]]);
    });
    await step('create_native_room', async () => {
      host.send(['server', 'create', roomKey, '联机检测', 'caocao', {}, 'single']);
      assert.deepEqual(await host.receive(message => message[0] === 'createroom'), ['createroom', roomKey]);
      host.send(['server', 'config', { mode: 'single', single_mode: 'biaofeng', biaofeng_four_bans: true, quick_duel: true, number: 2, player_number: '2', observe: false, gameStarted: false }]);
      const update = await guest.receive(message => message[0] === 'updaterooms' && message[1].some(room => room[4] === roomKey));
      const room = update[1].find(room => room[4] === roomKey);
      assert.equal(room[2].single_mode, 'biaofeng');
      assert.equal(room[2].biaofeng_four_bans, true);
      assert.equal(room[2].quick_duel, true);
    });
    await step('join_native_room', async () => {
      guest.send(['server', 'enter', roomKey, '联机检测客', 'zhaoyun']);
      assert.deepEqual(await host.receive(message => message[0] === 'onconnection'), ['onconnection', guestId]);
    });
    await step('relay_guest_to_host', async () => {
      const payload = ['hosting-smoke', { text: '中文联机验证', request: roomKey }];
      guest.send(payload);
      const message = await host.receive(message => message[0] === 'onmessage');
      assert.equal(message[1], guestId);
      assert.equal(message[2], JSON.stringify(payload));
    });
    await step('relay_host_to_guest', async () => {
      const payload = ['hosting-smoke-result', { accepted: true, request: roomKey }];
      host.send(['server', 'send', guestId, JSON.stringify(payload)]);
      assert.deepEqual(await guest.receive(message => message[0] === 'hosting-smoke-result'), payload);
    });
    await step('disconnect_and_remove_room', async () => {
      await guest.close();
      assert.deepEqual(await host.receive(message => message[0] === 'onclose'), ['onclose', guestId]);
      await host.close();
      const observer = await openClient(websocket); clients.push(observer);
      const rooms = await observer.receive(message => message[0] === 'roomlist');
      observer.send(['server', 'key', [`${roomKey}-observer`, version]]);
      // Cloud proxies can deliver the close frame before the origin's close event.
      // Wait for the native room-list update instead of assuming instantaneous cleanup.
      if (rooms[1].some(room => room[4] === roomKey)) {
        await observer.receive(message => message[0] === 'updaterooms' && !message[1].some(room => room[4] === roomKey));
      }
      await observer.close();
    });
  } catch (error) { report.errors.push(error.message); }
  finally { await Promise.allSettled(clients.map(client => client.close())); }
  report.ok = report.errors.length === 0;
  report.milliseconds = milliseconds(total);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) { console.error('Usage: node scripts/smoke-cloud.mjs https://your-game.example'); process.exitCode = 1; }
  else {
    try { const report = await smokeCloud(process.argv[2]); console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
    catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
  }
}
