// SPDX-License-Identifier: GPL-3.0-only
// Modified by noname-duel-cloud (2026-10-23): invite-link native online setup.
import { createQuickDuelView, addQuickDuelEntry } from './quick-duel-view.js';

const ROOM_ID = /^duel_[a-f0-9]{32}$/;
const TEMPORARY_CONFIG = new Set(['connect_mode', 'directstartmode', 'reconnect_info', 'tmp_owner_roomId', 'tmp_user_roomId', 'recentIP']);

export function parseQuickLink(location) {
  const url = new URL(location.href);
  if (!url.searchParams.has('quick')) return null;
  if (url.searchParams.getAll('quick').length !== 1) return { role: 'invalid' };
  const value = url.searchParams.get('quick');
  if (value === 'host') return { role: 'host' };
  return ROOM_ID.test(value || '') ? { role: 'guest', roomId: value } : { role: 'invalid' };
}

export function createQuickConfig(lib) {
  const config = {};
  for (const [key, descriptor] of Object.entries(lib.mode.single.connect)) {
    if (key.startsWith('connect_') && descriptor && 'init' in descriptor) config[key.slice(8)] = descriptor.init;
  }
  return Object.assign(config, {
    mode: 'single', single_mode: 'biaofeng', biaofeng_four_bans: true,
    number: 2, player_number: '2', quick_duel: true, gameStarted: false,
    characterPack: ['standard', 'shenhua', 'old'], cardPack: ['standard'],
    banned: [], bannedcards: [], zhinang_tricks: [...(lib.config.connect_zhinang_tricks || [])],
    observe: false, observe_handcard: false, change_card: false,
    choose_timeout: '60', version: lib.versionOL,
  });
}

export default function registerQuickDuel(context) {
  const { lib, game, ui, get, _status } = context;
  const location = context.location || globalThis.location;
  const request = parseQuickLink(location);
  if (!request) {
    lib.onload.push(() => {
      const mode = lib.imported.mode?.connect;
      if (!mode || lib.config.mode !== 'connect') return;
      const start = mode.start;
      mode.start = async function (...args) {
        await start.apply(this, args);
        const entry = addQuickDuelEntry({ document: context.document || globalThis.document, location });
        const clearConnect = game.clearConnect;
        game.clearConnect = function (...args) {
          entry.remove();
          return clearConnect.apply(this, args);
        };
      };
    });
    return;
  }
  if (lib.quickDuel) return;
  const document = context.document || globalThis.document;
  const navigator = context.navigator || globalThis.navigator;
  const crypto = context.crypto || globalThis.crypto;
  const storage = context.localStorage || globalThis.localStorage;
  let view, prepared = false, terminal = false, started = false, startQueued = false;
  let connected = false, entering = false, roomCreated = false, timeout;
  const render = state => {
    view ||= createQuickDuelView({ document, location, navigator });
    view.update(state);
    if (state.phase === 'playing') view = undefined;
  };
  const cancelTimeout = () => { clearTimeout(timeout); timeout = undefined; };
  const armTimeout = (milliseconds, message) => {
    cancelTimeout();
    timeout = setTimeout(() => fail(message), milliseconds);
    timeout?.unref?.();
  };
  function fail(status) {
    if (terminal) return;
    terminal = true;
    cancelTimeout();
    // Stop native AI fallback or queued actions behind the reconnect screen.
    game.pause();
    delete _status.connectCallback;
    _status.enteringroom = false;
    render({ phase: 'error', status });
    if (game.ws) {
      game.ws._nocallback = true;
      game.ws.close();
    }
    game.online = false;
    game.onlineroom = false;
    game.onlinehall = false;
    game.sandbox = null;
  }
  function inviteUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('quick', game.roomId);
    return url.href;
  }
  function showWaiting() {
    if (terminal || started || request.role !== 'host' || !_status.waitingForPlayer || !roomCreated) return;
    cancelTimeout();
    render({ phase: 'waiting', status: '房间已准备好，把邀请链接发给对方。两人到齐后自动开始。', inviteUrl: inviteUrl() });
  }
  function ready() {
    if (terminal || started || request.role !== 'host' || !game.onlineroom || game.online || !_status.waitingForPlayer || !lib.configOL.quick_duel) return false;
    const seats = (game.connectPlayers || []).filter(player => !player.classList.contains('unselectable2'));
    const clients = (lib.node?.clients || []).filter(client => !client.closed);
    if (seats.length !== 2 || clients.length !== 1 || seats.some(player => !player.playerid || !player.nickname)) return false;
    const host = seats.find(player => player.playerid === game.onlinezhu);
    const guest = seats.find(player => player !== host);
    return !!host && host.playerid === '1' && guest?.ws === clients[0] && guest.playerid === clients[0].id && clients[0].inited === true;
  }
  function maybeStart() {
    if (startQueued || !ready()) return;
    startQueued = true;
    queueMicrotask(() => {
      startQueued = false;
      if (!ready()) return;
      started = true;
      cancelTimeout();
      for (const key of ['connectStartButton', 'connectStartBar', 'connectShareButton']) {
        ui[key]?.delete();
        delete ui[key];
      }
      render({ phase: 'playing' });
      // Resume the original waitForPlayer event; its own config/gameStart and
      // single-mode startup continue unchanged, including the native draft.
      game.resume();
    });
  }
  function enterRoom(list) {
    if (terminal || entering || request.role !== 'guest') return;
    const room = list.find(item => item?.[4] === request.roomId);
    if (!room) {
      if (!timeout) armTimeout(7000, '邀请已失效，或房主已经离开。请让对方创建新对局。');
      return;
    }
    const config = room[2];
    if (!config || config.quick_duel !== true || config.mode !== 'single' || config.single_mode !== 'biaofeng') return fail('这不是快捷标风对局，请使用房主刚复制的邀请链接。');
    if (config.gameStarted) return fail('这局游戏已经开始。刷新不能恢复旧对局，请创建新对局。');
    if (Number(room[3]) >= 2) return fail('房间已经有两位玩家，请创建新对局。');
    entering = true;
    _status.enteringroom = true;
    render({ phase: 'joining', status: '已找到对方，正在加载对局…' });
    armTimeout(90000, '加入房间超时，请重新连接或创建新对局。');
    game.send('server', 'enter', request.roomId, get.connectNickname(), lib.config.connect_avatar);
  }

  render({ phase: 'loading', status: '正在加载游戏，首次打开可能稍慢…' });
  // boot captures this callback before loadConfig/prepare. Keep its slow-load
  // notice inline, without the native reset-confirm/reload loop.
  lib.init.reset = () => {
    if (!terminal && !connected) render({ phase: 'loading', status: '游戏加载较慢，请稍候…' });
  };

  lib.quickDuel = {
    prepare() {
      if (prepared) return;
      prepared = true;
      Object.assign(lib.config, { mode: 'connect', show_splash: 'off', totouched: true, confirm_exit: false });
      lib.config.touchscreen = 'ontouchstart' in document;
      lib.config.mode_config ||= {};
      lib.config.mode_config.connect ||= {};
      lib.config.mode_config.connect.read_clipboard = false;
      for (const key of ['reconnect_info', 'tmp_owner_roomId', 'tmp_user_roomId', 'directstartmode']) delete lib.config[key];
      // Native init/switchMode save room metadata. Keep those writes scoped to
      // this page so opening a quick invitation does not redirect normal play.
      const saveConfig = game.saveConfig;
      game.saveConfig = function (key, value, local, callback) {
        if (!local && TEMPORARY_CONFIG.has(key)) {
          if (value === undefined) delete lib.config[key];
          else lib.config[key] = value;
          callback?.();
          return;
        }
        return saveConfig.apply(this, arguments);
      };
    },
    async start() {
      if (connected || terminal) return;
      if (request.role === 'invalid') return fail('邀请链接不完整，请重新复制链接，或创建新对局。');
      try {
        // Never reuse a localStorage/sessionStorage key: duplicated tabs must
        // not overwrite an existing relay room or impersonate its owner.
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        game.onlineKey = `duel_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
        delete game.onlineID;
        delete game.roomId;
        delete game.roomIdServer;
        game.online = false;
        game.onlineroom = false;
        ui.create.menu(true);
        lib.init.onfree();
        // Empty address selects the native conservative sandbox policy without
        // granting trust to a server or writing its trust preference.
        game.requireSandboxOn();
        connected = true;
        render({ phase: request.role === 'host' ? 'loading' : 'joining', status: '正在连接对战服务…' });
        armTimeout(60000, '暂时连接不上对战服务，请重新连接。');
        game.connect(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`, result => {
          if (!result) fail('暂时连接不上对战服务，请重新连接。');
        });
      } catch (error) {
        console.error('Quick duel could not start:', error);
        fail('游戏未能启动，请重新连接。');
      }
    },
  };

  const client = lib.message.client;
  client.roomlist = function (list, events, clients, wsid) {
    if (terminal) return;
    // The relay requires this registration within two seconds of opening.
    game.send('server', 'key', [game.onlineKey, lib.version]);
    game.online = true;
    game.onlinehall = true;
    game.wsid = wsid;
    game.ip = get.trimip(_status.ip);
    _status.connectMode = true;
    game.send('server', 'changeAvatar', get.connectNickname(), lib.config.connect_avatar);
    cancelTimeout();
    if (request.role === 'host') {
      armTimeout(90000, '创建房间超时，请重新连接。');
      game.send('server', 'create', game.onlineKey, get.connectNickname(), lib.config.connect_avatar);
    } else enterRoom(list);
  };
  client.updaterooms = list => enterRoom(list);
  client.createroom = function (roomId) {
    if (terminal || roomCreated) return;
    if (request.role !== 'host' || roomId !== game.onlineKey) return fail('房间创建异常，请重新连接。');
    roomCreated = true;
    game.online = false;
    game.onlineroom = true;
    game.roomId = roomId;
    lib.node = {};
    game.switchMode('single', createQuickConfig(lib));
    ui.create.connecting(true);
  };
  const nativeInit = client.init;
  client.init = function (id, config, ip, servermode, roomId) {
    if (terminal) return;
    if (request.role !== 'guest' || roomId !== request.roomId || config?.quick_duel !== true || config.mode !== 'single' || config.single_mode !== 'biaofeng' || config.gameStarted) return fail('房间状态已经变化，请创建新对局。');
    return nativeInit.apply(this, arguments);
  };
  const nativeGameStart = client.gameStart;
  client.gameStart = function () {
    if (terminal) return;
    nativeGameStart.apply(this, arguments);
    started = true;
    cancelTimeout();
    render({ phase: 'playing' });
  };
  client.enterroomfailed = () => fail('邀请已失效、房间已满或对局已经开始，请创建新对局。');
  client.denied = reason => fail(reason === 'number' ? '房间已经有两位玩家，请创建新对局。' : reason === 'gaming' ? '这局游戏已经开始，请创建新对局。' : reason === 'version' ? '双方游戏版本不同，请刷新页面后创建新对局。' : '无法加入这个房间，请创建新对局。');
  client.selfclose = () => fail('房主已离开，当前对局已断开。请创建新对局。');
  const nativeClose = client.onclose;
  client.onclose = function (id) {
    const accepted = (game.connectPlayers || []).some(player => player.ws?.id === id) || (lib.node?.clients || []).some(current => current.id === id && current.inited);
    nativeClose.apply(this, arguments);
    if (accepted && started) fail('对方已断开连接，请创建新对局。');
    else showWaiting();
  };
  // The native exec handler protects onlineKey, but also persists it. Restore
  // only that one storage slot afterwards; keep all native parsing/sandboxing.
  const nativeExec = client.exec;
  client.exec = function () {
    const key = `${lib.configprefix}key`;
    const previous = storage?.getItem(key);
    try { return nativeExec.apply(this, arguments); }
    finally {
      if (storage) {
        if (previous == null) storage.removeItem(key);
        else storage.setItem(key, previous);
      }
    }
  };
  const nativeInited = lib.message.server.inited;
  lib.message.server.inited = function () {
    nativeInited.apply(this, arguments);
    maybeStart();
  };
  const nativePause = game.pause;
  game.pause = function () {
    const result = nativePause.apply(this, arguments);
    showWaiting();
    maybeStart();
    return result;
  };
  lib.element.ws.onerror = function () {
    if (!this._nocallback) fail('连接中断，请重新连接或创建新对局。');
  };
  lib.element.ws.onclose = function () {
    if (!this._nocallback) fail('连接已经断开。刷新不能恢复旧对局，请创建新对局。');
  };
  lib.onload.push(() => {
    const mode = lib.imported.mode.connect;
    if (!mode) return fail('游戏联机模块加载失败，请重新连接。');
    // Async content retains closures in the native event compiler.
    mode.start = async function () { await lib.quickDuel.start(); };
  });
}
