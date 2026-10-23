/**
 * Exercise the upstream handshake and waiting barrier, rather than reproducing
 * them in the shortcut tests. Only DOM, mode loading, and sockets are fixtures.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const librarySource = await readFile(new URL('../noname/apps/core/noname/library/index.js', import.meta.url), 'utf8');
const contentSource = await readFile(new URL('../noname/apps/core/noname/library/element/content.ts', import.meta.url), 'utf8');
const connectionSource = await readFile(new URL('../noname/apps/core/noname/library/init/index.js', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('../noname/apps/core/noname/library/element/client.js', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../noname/apps/core/noname/game/index.js', import.meta.url), 'utf8');
const pauseSource = await readFile(new URL('../noname/apps/core/dist/noname/game/PauseManager.js', import.meta.url), 'utf8');
const statusSource = await readFile(new URL('../noname/apps/core/noname/status/index.js', import.meta.url), 'utf8');
const securitySource = await readFile(new URL('../noname/apps/core/noname/util/sandbox/security.js', import.meta.url), 'utf8');
const quickSource = await readFile(new URL('../additions/quick-duel.js', import.meta.url), 'utf8');

function nativeMethod(context, source, signature, indent, name, classMethod = false) {
  const start = source.indexOf(`${indent}${signature}`);
  assert.notEqual(start, -1, `Upstream method ${signature} still exists`);
  const ending = `\n${indent}}${classMethod ? '\n' : ','}`;
  const end = source.indexOf(ending, start);
  assert.notEqual(end, -1, `Upstream method ${signature} still has its original indentation`);
  const method = source.slice(start, end + indent.length + 2);
  return vm.runInContext(`({${method}})`, context)[name];
}

function fixture() {
  const sent = [], broadcasts = [], notices = [], saved = [];
  let modeCallback, resumes = 0, loopStarted = false;
  const nativeArray = values => Object.assign(values, {
    remove(value) { const index = this.indexOf(value); if (index >= 0) this.splice(index, 1); return this; },
  });
  const slot = () => ({
    classList: { contains: () => false },
    initOL(nickname, avatar) { this.nickname = nickname; this.avatar = avatar; },
    uninitOL() {}, setIdentity(identity) { this.identity = identity; }, delete() { this.deleted = true; },
  });
  const lib = {
    config: { extensions: [], recentIP: nativeArray([]), connect_avatar: 'caocao' }, configprefix: 'noname_',
    configOL: { mode: 'single', number: 2, single_mode: 'biaofeng', observe: false },
    versionOL: '1.11.7', version: '1.11.7', translate: {},
    node: { clients: nativeArray([]), observing: nativeArray([]), banned: [] },
    playerOL: {}, characterPack: {}, character: {}, skill: {}, card: {},
    message: { server: {}, client: {} }, init: { startOnline: [], onfree() {} },
    onload: [], imported: { mode: { connect: {} } }, mode: { single: { connect: {} } },
    element: { ws: {}, GameEvent: { initialGameEvent: () => ({ name: 'root' }) }, Player: class {} },
  };
  let _status = { event: { name: 'root' }, ip: 'wss://game.example' };
  const ui = {
    auto: { hide() {}, show() {} }, pause: { hide() {}, show() {} },
    create: {
      menu() {}, roomInfo() {}, chat() {}, connecting() {},
      connectPlayers() { game.connectPlayers = [slot(), slot()]; game.me = game.connectPlayers[0]; },
    },
  };
  const game = {
    ip: _status.ip, roomId: 'quick-host-key', onlineroom: true, onlineKey: 'quick-host-key',
    createServer() { lib.node.clients = nativeArray([]); lib.node.observing = nativeArray([]); lib.node.banned = []; },
    send(...message) { sent.push(message); },
    saveConfig(...args) { saved.push(args); },
    clearArena() {}, finishCards() {}, clearConnect() {},
    loadModeAsync(mode, callback) { assert.equal(mode, 'single'); modeCallback = callback; },
    createEvent() { return { setContent() {} }; },
    loop() { loopStarted = true; },
    stopCountChoose() {},
    broadcast(...args) { broadcasts.push(args); },
    updateWaiting() { notices.push('updateWaiting'); },
    delay() {}, requireSandboxOn() {},
    switchMode(mode, config) { assert.equal(mode, 'single'); lib.configOL = config; },
    connect(ip, callback) {
      _status.ip = ip; _status.connectCallback = callback;
      game.ws = { close() { this.closed = true; } };
    },
  };
  const get = { config: () => false, connectNickname: () => '测试玩家', trimip: value => value, parsedResult: value => value, stringifiedResult: value => value };
  const security = { createSandbox: () => null };
  const context = vm.createContext({ lib, game, get, ui, _status, ai: {}, security, console, clearTimeout, setTimeout });
  vm.runInContext(`${pauseSource.replace(/^import .*;\n/gm, '').replace(/\nexport \{[\s\S]*$/, '')};`, context);
  // The event manager is not used by these network tests; the pause/deferred
  // implementation and Status paused getter/setter are the real upstream code.
  context.GameEventManager = class { getStatusEvent() { return this.event; } setStatusEvent(event) { this.event = event; } };
  const Status = vm.runInContext(`${statusSource.replace(/^import .*;\n/gm, '').replace('export class status', 'class status').split('export let _status')[0]}; status;`, context);
  _status = context._status = Object.assign(new Status(), _status);
  game.pause = nativeMethod(context, gameSource, 'pause() {', '\t', 'pause', true);
  const nativeResume = nativeMethod(context, gameSource, 'resume() {', '\t', 'resume', true);
  game.resume = function () { resumes++; return nativeResume.call(this); };
  lib.message.server.init = nativeMethod(context, librarySource, 'init(version, config, banned_info) {', '\t\t\t', 'init');
  lib.message.server.inited = nativeMethod(context, librarySource, 'inited() {', '\t\t\t', 'inited');
  lib.message.client.opened = nativeMethod(context, librarySource, 'opened: function () {', '\t\t\t', 'opened');
  lib.message.client.init = nativeMethod(context, librarySource, 'init: function (id, config, ip, servermode, roomId) {', '\t\t\t', 'init');
  lib.message.client.gameStart = nativeMethod(context, librarySource, 'gameStart: function () {', '\t\t\t', 'gameStart');
  const waitForPlayer = nativeMethod(context, contentSource, 'async waitForPlayer(event, trigger, player) {', '\t', 'waitForPlayer');
  const connection = nativeMethod(context, connectionSource, 'connection(ws) {', '\t', 'connection', true);
  lib.element.Client = vm.runInContext(`${clientSource.replace(/^import .*;\n/gm, '').replace('export class Client', 'class Client')}; Client;`, context);
  function connect(id) {
    const messages = [], handlers = {};
    const ws = { wsid: id, on(name, handler) { handlers[name] = handler; }, send(raw) { messages.push(JSON.parse(raw)); }, close() { handlers.close?.(); } };
    connection(ws);
    return {
      client: lib.node.clients.find(client => client.id === id), messages,
      dispatch(message) { handlers.message(JSON.stringify(message)); },
      close() { ws.close(); },
    };
  }
  return {
    context, lib, game, ui, get, _status, sent, saved, broadcasts, notices, waitForPlayer, connect,
    loadedMode() { assert.ok(modeCallback, 'Native init requested its mode'); modeCallback({ ai: {}, get: {}, translate: {} }); },
    get resumes() { return resumes; }, get loopStarted() { return loopStarted; },
  };
}

function quickFixture(role = 'host', storage = new Map()) {
  const run = fixture(), views = [];
  const location = new URL(`https://game.example/?quick=${role}`);
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  Object.assign(run.context, {
    URL, queueMicrotask,
    createQuickDuelView: () => ({ update: state => views.push(state) }),
  });
  vm.runInContext(`${quickSource.replace(/^import .*;\n/gm, '').replace(/\bexport default function /g, 'function ').replace(/\bexport function /g, 'function ')}; globalThis.registerQuickDuel = registerQuickDuel;`, run.context);
  run.context.registerQuickDuel({
    lib: run.lib, game: run.game, ui: run.ui, get: run.get, _status: run._status,
    document: {}, navigator: {}, location, localStorage, crypto: webcrypto,
  });
  return Object.assign(run, { views, storage, localStorage });
}

async function quickHost() {
  const run = quickFixture();
  run.lib.quickDuel.prepare();
  await run.lib.quickDuel.start();
  run.lib.message.client.roomlist([], [], [], 'host-socket');
  run.lib.message.client.createroom(run.game.onlineKey);
  run.waiting = run.waitForPlayer({});
  assert.equal(run.views.at(-1).phase, 'waiting');
  assert.equal(new URL(run.views.at(-1).inviteUrl).searchParams.get('quick'), run.game.onlineKey);
  return run;
}

test('native guest sends inited only after the mode and online event loop are ready', () => {
  const run = fixture();
  run.game.onlineKey = 'independent-guest-key';
  run.lib.message.client.opened();
  const hello = run.sent.shift();
  assert.equal(hello[0], 'init');
  assert.equal(hello[2].onlineKey, 'independent-guest-key');
  assert.equal(hello[2].id, undefined, 'Fresh clients do not claim a stored player identity');

  run.lib.message.client.init('guest-id', run.lib.configOL, run.game.ip, false, 'quick-host-key');
  assert.equal(run.game.onlineID, 'guest-id');
  assert.equal(run.sent.some(message => message[0] === 'inited'), false);
  assert.equal(run.loopStarted, false);
  run.loadedMode();
  assert.equal(run.loopStarted, true);
  assert.equal(run.sent.filter(message => message[0] === 'inited').length, 1);
});

test('native sandbox can be enabled without a server trust dialog or persistent grant', () => {
  const start = securitySource.indexOf('function requireSandboxOn(ip) {');
  const end = securitySource.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({
    TRUSTED_IPS: [], TRUSTED_IP_MD5: [], SANDBOX_FORCED: false,
    alertForServer() { assert.fail('The quick entry must never ask to trust server code'); },
    localStorage: { setItem() { assert.fail('The quick entry must never persist a trust grant'); } },
  });
  vm.runInContext(`let sandBoxRequired = false; ${securitySource.slice(start, end)}; requireSandboxOn();`, context);
  assert.equal(vm.runInContext('sandBoxRequired', context), true);
});

test('native host reserves one remote seat, rejects a third player, and waits at its real pause barrier', async () => {
  const run = fixture();
  let completed = false;
  const waiting = run.waitForPlayer({}).then(() => { completed = true; });
  assert.equal(run._status.waitingForPlayer, true);
  assert.equal(run.game.connectPlayers[0].playerid, '1');
  assert.equal(run.sent[0][2].gameStarted, undefined);

  const guest = run.connect('guest-id');
  assert.deepEqual(guest.messages.shift(), ['opened']);
  guest.dispatch(['init', run.lib.versionOL, { onlineKey: 'guest-key', nickname: '对方', avatar: 'zhaoyun' }]);
  assert.equal(guest.messages.at(-1)[0], 'init');
  assert.equal(run.game.connectPlayers[1].ws, guest.client);
  assert.equal(guest.client.inited, undefined, 'Socket admission is not mode readiness');
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(run.resumes, 0);

  const third = run.connect('third-id');
  third.dispatch(['init', run.lib.versionOL, { onlineKey: 'third-key', nickname: '第三人', avatar: 'liubei' }]);
  assert.deepEqual(third.messages.at(-1), ['denied', 'number']);
  assert.equal(third.client.closed, true);
  assert.equal(run.lib.node.clients.includes(third.client), false);
  assert.equal(run.game.connectPlayers[1].playerid, 'guest-id');

  guest.dispatch(['inited']);
  assert.equal(guest.client.inited, true);
  assert.equal(run.notices.length, 1);
  assert.equal(run.resumes, 0, 'The native lobby itself does not start automatically');
  run.game.resume();
  await waiting;
  assert.equal(completed, true);
  assert.equal(run._status.waitingForPlayer, false);
  assert.equal(run.lib.configOL.gameStarted, true);
  assert.equal(run.game.connectPlayers, undefined);
  assert.equal(run.broadcasts.some(message => message[0] === 'gameStart'), true);
});

test('quick host starts once only after the actual native guest loader sends inited', async () => {
  const run = await quickHost();
  const peer = run.connect('guest-id');
  const guest = fixture();
  guest.game.onlineKey = 'independent-guest';
  guest.game.send = (...message) => {
    guest.sent.push(message);
    peer.dispatch(message);
  };
  guest.lib.message.client.opened();
  const admitted = peer.messages.find(message => message[0] === 'init');
  assert.ok(admitted, 'Native host accepted the fresh second client');
  guest.lib.message.client.init(...JSON.parse(JSON.stringify(admitted.slice(1))));
  await Promise.resolve();
  assert.equal(run.resumes, 0, 'A joined seat is not a ready guest');
  assert.equal(run.views.at(-1).phase, 'waiting');

  guest.loadedMode();
  await run.waiting;
  assert.equal(run.resumes, 1);
  assert.equal(run.lib.configOL.gameStarted, true);
  assert.equal(run.views.filter(state => state.phase === 'playing').length, 1);
  assert.equal(run.broadcasts.filter(message => message[0] === 'gameStart').length, 1);
  peer.dispatch(['inited']);
  await Promise.resolve();
  assert.equal(run.resumes, 1, 'Duplicate acknowledgements cannot restart the draft');
});

test('unadmitted, rejected, and disconnected native clients cannot trigger a quick start', async () => {
  const run = await quickHost();
  const unadmitted = run.connect('unadmitted');
  unadmitted.dispatch(['inited']);
  await Promise.resolve();
  assert.equal(run.resumes, 0, 'An inited message without an occupied seat is insufficient');
  unadmitted.close();

  const guest = run.connect('guest-id');
  guest.dispatch(['init', run.lib.versionOL, { onlineKey: 'guest-key', nickname: '对方', avatar: 'zhaoyun' }]);
  const rejected = run.connect('third-id');
  rejected.dispatch(['init', run.lib.versionOL, { onlineKey: 'third-key', nickname: '第三人', avatar: 'liubei' }]);
  rejected.dispatch(['inited']);
  await Promise.resolve();
  assert.equal(rejected.client.closed, true);
  assert.equal(run.resumes, 0, 'Rejected clients cannot impersonate the accepted guest');

  guest.dispatch(['inited']);
  guest.close();
  await Promise.resolve();
  assert.equal(run.resumes, 0, 'The queued start must recheck that its guest is still connected');
  assert.equal(run._status.waitingForPlayer, true);

  const replacement = run.connect('replacement-id');
  replacement.dispatch(['init', run.lib.versionOL, { onlineKey: 'replacement-key', nickname: '对方', avatar: 'zhaoyun' }]);
  replacement.dispatch(['inited']);
  await run.waiting;
  assert.equal(run.resumes, 1, 'A new accepted guest can still start the waiting room');
});

test('two quick tabs sharing saved preferences receive distinct identities and create fresh rooms', async () => {
  const storage = new Map([['noname_key', 'saved-normal-online-key']]);
  const first = quickFixture('host', storage), second = quickFixture('host', storage);
  for (const run of [first, second]) {
    Object.assign(run.lib.config, {
      reconnect_info: ['wss://old.example', 'old-id'],
      tmp_owner_roomId: 'old-owned-room', tmp_user_roomId: 'old-joined-room', directstartmode: 'identity',
    });
    run.game.onlineID = 'old-id';
    run.game.roomId = 'old-owned-room';
    run.lib.quickDuel.prepare();
    await run.lib.quickDuel.start();
    run.lib.message.client.roomlist([['old', 'caocao', { mode: 'identity' }, 1, 'old-owned-room']], [], [], 'socket-id');
    assert.equal(run.game.onlineID, undefined);
    assert.equal(run.game.roomId, undefined);
    assert.equal(run.lib.config.tmp_owner_roomId, undefined);
    assert.equal(run.lib.config.tmp_user_roomId, undefined);
    assert.equal(run.lib.config.reconnect_info, undefined);
    const commands = run.sent.filter(message => message[0] === 'server');
    assert.equal(commands[0][1], 'key', 'Relay registration must precede create/enter');
    assert.equal(commands[0][2][0], run.game.onlineKey);
    assert.equal(commands.at(-1)[1], 'create');
    assert.equal(commands.at(-1)[2], run.game.onlineKey);
    assert.equal(commands.some(message => message[1] === 'enter'), false);
    run.lib.element.ws.onclose.call(run.game.ws);
  }
  assert.notEqual(first.game.onlineKey, second.game.onlineKey);
  assert.equal(storage.get('noname_key'), 'saved-normal-online-key');
});
