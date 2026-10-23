import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../additions/quick-duel.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const roomId = `duel_${'a'.repeat(32)}`;

function fixture(query = 'host', sharedStorage = new Map([['noname_key', 'normal-player']])) {
  const calls = { sent: [], connects: [], saved: [], views: [], resumes: 0, native: [], switches: [] };
  const timers = new Map();
  let timerId = 0;
  const lib = {
    configprefix: 'noname_', versionOL: '1.11.7', version: '1.11.7',
    config: { mode: 'identity', show_splash: 'on', connect_avatar: 'caocao', reconnect_info: ['old-server', 'old-id'], tmp_user_roomId: 'old-room', tmp_owner_roomId: 'old-owner', directstartmode: 'identity', mode_config: { connect: { read_clipboard: true } } },
    configOL: {}, node: {}, onload: [], imported: { mode: { connect: { start() { throw new Error('Native connect start must be bypassed'); } } } },
    mode: { single: { connect: { connect_single_mode: { init: 'normal' }, connect_choose_timeout: { init: '30' }, connect_observe: { init: true }, update() {} } } },
    init: { reset() { throw new Error('native reset dialog'); }, onfree() {} },
    element: { ws: { onerror() { throw new Error('native error dialog'); }, onclose() { throw new Error('native close reload'); } } },
    message: { client: {}, server: {} },
  };
  const localStorage = { getItem: key => sharedStorage.get(key) ?? null, setItem: (key, value) => sharedStorage.set(key, value), removeItem: key => sharedStorage.delete(key) };
  const _status = {};
  const game = {
    onlineKey: 'normal-player', onlineID: 'old-id', roomId: 'old-room', roomIdServer: 'old-server-room',
    send(...args) { calls.sent.push(plain(args)); },
    connect(url, callback) { calls.connects.push(url); this.ws = { close() { calls.native.push('socket-close'); } }; _status.ip = url; callback(true); },
    requireSandboxOn(...args) { calls.native.push(['sandbox', args]); },
    saveConfig(...args) { calls.saved.push(args); },
    switchMode(mode, config) { lib.configOL = config; calls.switches.push([mode, config]); },
    pause() { calls.native.push('pause'); return 'native pause'; },
    resume() { calls.resumes++; },
  };
  const ui = { create: { menu() {}, connecting() {} } };
  const get = { connectNickname: () => '玩家', trimip: value => value };
  Object.assign(lib.message.client, {
    init(...args) { calls.native.push(['init', ...args]); },
    gameStart() { calls.native.push('gameStart'); },
    onclose(id) { lib.node.clients = (lib.node.clients || []).filter(client => client.id !== id); },
    exec(func) { func?.(); localStorage.setItem('noname_key', game.onlineKey); },
  });
  lib.message.server.inited = function () { this.inited = true; calls.native.push('inited'); };
  const location = new URL(`https://game.example/${query === null ? '' : `?quick=${encodeURIComponent(query)}`}`);
  const document = {};
  const context = vm.createContext({
    URL, Uint8Array, console, queueMicrotask,
    setTimeout(callback, duration) { const id = ++timerId; timers.set(id, { callback, duration }); return id; },
    clearTimeout(id) { timers.delete(id); },
    createQuickDuelView() {
      const view = { updates: [], removed: false, update(state) { this.updates.push(state); if (state.phase === 'playing') this.removed = true; }, remove() { this.removed = true; } };
      calls.views.push(view);
      return view;
    },
    addQuickDuelEntry() {
      calls.native.push('shortcut');
      return { remove() { calls.native.push('remove-shortcut'); } };
    },
  });
  const api = vm.runInContext(`(() => { ${source.replace(/^import .+;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')}; return { registerQuickDuel, parseQuickLink, createQuickConfig }; })()`, context);
  const env = { lib, game, ui, get, _status, location, document, navigator: {}, crypto: webcrypto, localStorage };
  function register() { api.registerQuickDuel(env); }
  async function boot() {
    register();
    lib.quickDuel?.prepare();
    for (const load of lib.onload) load();
    if (lib.quickDuel) await lib.imported.mode.connect.start();
  }
  const state = () => calls.views.at(-1)?.updates.at(-1);
  const room = (changes = {}, count = 1) => ['房主', 'caocao', { mode: 'single', single_mode: 'biaofeng', quick_duel: true, ...changes }, count, roomId];
  const expire = duration => { for (const [id, timer] of [...timers]) if (timer.duration === duration) { timers.delete(id); timer.callback(); } };
  return { ...env, ...api, calls, timers, register, boot, state, room, expire, sharedStorage };
}

function setupWaiting(env) {
  env.lib.message.client.roomlist([], [], [], 'host-socket');
  env.lib.message.client.createroom(env.game.onlineKey);
  const classList = { contains: () => false };
  const client = { id: 'guest-socket', closed: false };
  env.game.connectPlayers = [
    { playerid: '1', nickname: '房主', classList },
    { playerid: client.id, nickname: '客人', ws: client, classList },
  ];
  env.game.onlinezhu = '1';
  env.lib.node.clients = [client];
  env._status.waitingForPlayer = true;
  env.game.pause();
  return client;
}

test('ordinary URLs do not alter configuration, network handlers, or startup', () => {
  const env = fixture(null);
  const original = env.lib.message.client.init;
  env.register();
  assert.equal(env.lib.quickDuel, undefined);
  assert.equal(env.lib.message.client.init, original);
  assert.equal(env.lib.config.mode, 'identity');
  assert.equal(env.calls.views.length, 0);
});

test('ordinary connect page keeps its original startup and removes the shortcut when joining', async () => {
  const env = fixture(null);
  env.lib.config.mode = 'connect';
  env.lib.imported.mode.connect.start = async () => env.calls.native.push('normal-start');
  env.game.clearConnect = () => env.calls.native.push('clear-connect');
  await env.boot();
  await env.lib.imported.mode.connect.start();
  assert.deepEqual(env.calls.native, ['normal-start', 'shortcut']);
  env.game.clearConnect();
  assert.deepEqual(env.calls.native, ['normal-start', 'shortcut', 'remove-shortcut', 'clear-connect']);
  assert.equal(env.calls.connects.length, 0);
  assert.equal(env.lib.quickDuel, undefined);
});

test('host uses a fresh per-document cryptographic identity without changing ordinary saved preferences', async () => {
  const first = fixture();
  const second = fixture('host', first.sharedStorage);
  await first.boot();
  await second.boot();
  assert.match(first.game.onlineKey, /^duel_[a-f0-9]{32}$/);
  assert.notEqual(first.game.onlineKey, second.game.onlineKey);
  assert.equal(first.game.onlineID, undefined);
  assert.equal(first.game.roomId, undefined);
  assert.equal(first.lib.config.reconnect_info, undefined);
  assert.equal(first.lib.config.mode_config.connect.read_clipboard, false);
  assert.equal(first.lib.config.totouched, true);
  assert.equal(first.lib.config.confirm_exit, false);
  assert.deepEqual(first.calls.saved, []);
  assert.deepEqual(first.calls.connects, ['wss://game.example']);
  assert.deepEqual(first.calls.native.find(value => Array.isArray(value) && value[0] === 'sandbox'), ['sandbox', []]);
  first.lib.message.client.exec(() => {});
  assert.equal(first.sharedStorage.get('noname_key'), 'normal-player');
  first.game.saveConfig('reconnect_info', ['temporary']);
  first.game.saveConfig('volume_audio', 3);
  assert.deepEqual(first.calls.saved, [['volume_audio', 3]]);
});

test('host registers relay identity before creating the room and uses complete explicit native config', async () => {
  const env = fixture();
  await env.boot();
  const guest = setupWaiting(env);
  assert.deepEqual(env.calls.sent.map(value => value.slice(0, 2)), [['server', 'key'], ['server', 'changeAvatar'], ['server', 'create']]);
  assert.equal(env.calls.sent[2][2], env.game.onlineKey);
  const [mode, config] = env.calls.switches[0];
  assert.equal(mode, 'single');
  assert.equal(config.single_mode, 'biaofeng');
  assert.equal(config.quick_duel, true);
  assert.equal(config.number, 2);
  assert.equal(config.observe, false);
  assert.deepEqual(plain(config.cardPack), ['standard']);
  assert.deepEqual(plain(config.characterPack), ['standard', 'shenhua', 'old']);
  assert.deepEqual(plain(config.bannedcards), []);
  assert.equal(env.state().phase, 'waiting');
  assert.equal(new URL(env.state().inviteUrl).searchParams.get('quick'), env.game.onlineKey);
  assert.equal(env.calls.resumes, 0, 'an occupied seat does not imply the guest has finished loading');
  env.lib.message.server.inited.call(guest);
  assert.equal(env.calls.resumes, 0, 'start is queued until the current handshake task completes');
  await Promise.resolve();
  assert.equal(env.calls.resumes, 1);
  assert.equal(env.state().phase, 'playing');
  env.lib.message.server.inited.call(guest);
  await Promise.resolve();
  assert.equal(env.calls.resumes, 1, 'duplicate acknowledgements cannot start twice');
});

test('spurious acknowledgements, closed sockets, and a guest leaving before the queued start cannot auto-start', async () => {
  const env = fixture();
  await env.boot();
  const guest = setupWaiting(env);
  env.lib.message.server.inited.call({ id: 'unknown', closed: false });
  await Promise.resolve();
  assert.equal(env.calls.resumes, 0);
  guest.closed = true;
  env.lib.message.server.inited.call(guest);
  await Promise.resolve();
  assert.equal(env.calls.resumes, 0);
  guest.closed = false;
  env.lib.message.server.inited.call(guest);
  env.lib.node.clients = [];
  await Promise.resolve();
  assert.equal(env.calls.resumes, 0);
});

test('guest ignores stale cached rooms and joins only the requested marked classic duel', async () => {
  const env = fixture(roomId);
  await env.boot();
  env.lib.message.client.roomlist([env.room()], [], [], 'guest-socket');
  assert.deepEqual(env.calls.sent.map(value => value.slice(0, 2)), [['server', 'key'], ['server', 'changeAvatar'], ['server', 'enter']]);
  assert.equal(env.calls.sent[2][2], roomId);
  assert.notEqual(env.game.onlineKey, roomId);
  assert.equal(env.calls.switches.length, 0);
  env.lib.message.client.init('id', env.room()[2], 'wss://game.example', false, roomId);
  assert.equal(env.calls.native.some(value => Array.isArray(value) && value[0] === 'init'), true);
  assert.equal(env.state().phase, 'joining');
  env.lib.message.client.gameStart();
  assert.equal(env.state().phase, 'playing');
  assert.equal(env.calls.views[0].removed, true);
});

test('missing, full, already-started, and wrong-mode rooms fail inline without entering', async () => {
  for (const [changes, count, expected] of [
    [{}, 2, /两位/], [{ gameStarted: true }, 1, /已经开始/], [{ quick_duel: false }, 1, /不是快捷/], [{ mode: 'identity' }, 1, /不是快捷/],
  ]) {
    const env = fixture(roomId);
    await env.boot();
    env.lib.message.client.roomlist([env.room(changes, count)], [], [], 'guest-socket');
    assert.equal(env.state().phase, 'error');
    assert.match(env.state().status, expected);
    assert.equal(env.calls.sent.some(value => value[1] === 'enter'), false);
  }
  const env = fixture(roomId);
  await env.boot();
  env.lib.message.client.roomlist([], [], [], 'guest-socket');
  assert.equal(env.state().phase, 'joining');
  env.expire(7000);
  assert.equal(env.state().phase, 'error');
  assert.match(env.state().status, /失效/);
});

test('a not-yet-published room may appear before the bounded missing-room deadline', async () => {
  const env = fixture(roomId);
  await env.boot();
  env.lib.message.client.roomlist([], [], [], 'guest-socket');
  env.lib.message.client.updaterooms([env.room()]);
  env.expire(7000);
  assert.equal(env.state().phase, 'joining');
  assert.equal(env.calls.sent.filter(value => value[1] === 'enter').length, 1);
});

test('all connection failures remain inline, and a disconnect can recreate the removed invitation overlay', async () => {
  for (const method of ['onerror', 'onclose']) {
    const env = fixture();
    await env.boot();
    const guest = setupWaiting(env);
    env.lib.message.server.inited.call(guest);
    await Promise.resolve();
    const pausesBeforeDisconnect = env.calls.native.filter(value => value === 'pause').length;
    env.lib.element.ws[method].call(env.game.ws);
    assert.equal(env.calls.views.length, 2);
    assert.equal(env.state().phase, 'error');
    assert.equal(env.game.ws._nocallback, true);
    assert.equal(env.calls.native.filter(value => value === 'pause').length, pausesBeforeDisconnect + 1, 'the failed game must stop behind the error overlay');
    env.lib.message.server.inited.call(guest);
    await Promise.resolve();
    assert.equal(env.calls.resumes, 1, 'terminal errors cannot restart the old game');
  }
  for (const method of ['enterroomfailed', 'denied', 'selfclose']) {
    const env = fixture(roomId);
    await env.boot();
    env.lib.message.client[method]('number');
    assert.equal(env.state().phase, 'error');
    assert.equal(env.calls.native.includes('socket-close'), true);
  }
});

test('invalid invitations never connect and the early boot timeout only updates the view', async () => {
  const env = fixture('<script>bad</script>');
  env.register();
  env.lib.init.reset();
  assert.match(env.state().status, /较慢/);
  env.lib.quickDuel.prepare();
  for (const load of env.lib.onload) load();
  await env.lib.imported.mode.connect.start();
  assert.equal(env.state().phase, 'error');
  assert.deepEqual(env.calls.connects, []);
  assert.equal(env.state().status.includes('<script>'), false);
});
