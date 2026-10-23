// Modified by noname-duel-cloud (2026-10-23), GPL-3.0-only.
// Register before boot so both local setup and the online room menu see the mode.
import { refreshBiaofengRosterMenus } from './biaofeng-roster-menu.js';
const installed = new WeakSet();

export default function registerBiaofengMenu(lib, get) {
  if (installed.has(lib)) return;
  const single = lib.mode?.single;
  if (!single?.config?.single_mode?.item || !single?.connect?.connect_single_mode?.item) {
    throw new Error('The pinned single-mode menu is unavailable.');
  }
  for (const [section, prefix] of [[single.config, ''], [single.connect, 'connect_']]) {
    section[`${prefix}single_mode`].item.biaofeng = '标风 1v1';
    section[`${prefix}biaofeng_four_bans`] = {
      name: '标风四禁',
      init: true,
      restart: true,
      frequent: true,
      intro: '默认不选孙权、曹操、吕蒙、华佗；关闭后使用全部 33 名标准与风包武将。',
    };
    const previousUpdate = section.update;
    section.update = function (config, map) {
      previousUpdate?.call(this, config, map);
      const row = map[`${prefix}biaofeng_four_bans`];
      if (row) row[config[`${prefix}single_mode`] === 'biaofeng' ? 'show' : 'hide']();
      if (prefix && lib.quickDuel) {
        for (const node of Object.values(map)) node?.classList?.add('disabled');
      }
      refreshBiaofengRosterMenus(lib);
    };
    section[`${prefix}single_mode`].intro += '；标风 1v1：六明四暗、各选五将后定三将顺序、标准＋EX 共 108 张牌。';
  }
  lib.translate.biaofeng = '标风 1v1';
  lib.translate.biaofeng2 = '标风 1v1';
  if (get?.modetrans) {
    const previous = get.modetrans;
    get.modetrans = function (config, ...args) {
      if (config.mode === 'single' && config.single_mode === 'biaofeng') return '标风 1v1';
      return previous.call(this, config, ...args);
    };
  }
  installed.add(lib);
}
