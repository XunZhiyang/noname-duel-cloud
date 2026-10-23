// SPDX-License-Identifier: GPL-3.0-only
// Explicit local/hall URLs override saved startup preferences for this page only.
const temporaryKeys = new Set(['mode', 'characters', 'cards', 'show_splash', 'totouched', 'touchscreen', 'confirm_exit', 'directstartmode', 'reconnect_info']);

export default function registerDuelEntry(context) {
  const { lib, game, ui, _status } = context;
  const location = context.location || globalThis.location;
  const document = context.document || globalThis.document;
  const url = new URL(location.href);
  if (url.searchParams.has('quick') || url.searchParams.getAll('play').length !== 1) return;
  const play = url.searchParams.get('play');
  if (!['ai', 'hall'].includes(play) || lib.duelEntry) return;
  const local = play === 'ai';
  let prepared = false, notice;
  function showLoading(text) {
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'noname-duel-loading';
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483000;display:grid;place-content:center;gap:18px;padding:28px;text-align:center;background:#17232e;color:#f4eada;font:16px/1.8 sans-serif;';
      const label = document.createElement('p');
      label.style.cssText = 'all:initial;display:block;color:inherit;font:inherit;';
      const back = document.createElement('a');
      back.href = '/';
      back.textContent = '返回入口';
      back.style.cssText = 'all:initial;display:block;color:#dec098;font:14px/2 sans-serif;text-decoration:underline;cursor:pointer;';
      notice.append(label, back);
      document.documentElement.append(notice);
    }
    notice.firstChild.textContent = text;
  }
  showLoading(local ? '正在进入标风 1v1 人机…' : '正在进入联机大厅…');
  lib.init.reset = () => showLoading('首次加载可能稍慢，请稍候…');
  lib.duelEntry = {
    prepare() {
      if (prepared) return;
      prepared = true;
      Object.assign(lib.config, { mode: local ? 'single' : 'connect', show_splash: 'off', totouched: true, touchscreen: 'ontouchstart' in document, confirm_exit: false });
      delete lib.config.directstartmode;
      delete lib.config.reconnect_info;
      lib.config.mode_config ||= {};
      lib.config.mode_config.connect ||= {};
      lib.config.mode_config.connect.read_clipboard = false;
      const settings = lib.config.mode_config.single ||= {};
      if (local) {
        Object.assign(settings, { single_mode: 'biaofeng', biaofeng_four_bans: true, change_card: false });
        lib.config.characters = ['standard', 'shenhua', 'old'];
        lib.config.cards = ['standard'];
        _status.connectMode = false;
        game.online = false;
      }
      const saveConfig = game.saveConfig;
      game.saveConfig = function (key, value, mode, callback) {
        if (!mode && temporaryKeys.has(key)) {
          if (value === undefined) delete lib.config[key];
          else lib.config[key] = value;
          callback?.();
          return;
        }
        return saveConfig.apply(this, arguments);
      };
    },
  };
  lib.onload.push(() => {
    const mode = lib.imported.mode?.[local ? 'single' : 'connect'];
    if (!mode) { showLoading('游戏未能加载，请返回入口重试。'); return; }
    const start = mode.start;
    mode.start = async function (...args) {
      notice?.remove();
      notice = undefined;
      ui.create.system('返回入口', () => { location.href = '/'; }, true);
      try { return await start.apply(this, args); }
      catch (error) { showLoading('游戏未能启动，请返回入口重试。'); throw error; }
    };
  });
}
