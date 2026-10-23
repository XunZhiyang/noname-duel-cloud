// SPDX-License-Identifier: GPL-3.0-only
// Show the same fixed roster used by the draft, instead of unrelated pack switches.
import { getBiaofengRoster } from './biaofeng-data.js';

const panels = new WeakMap();
const attached = new WeakMap();
const factions = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };

export function getBiaofengMenuSelection(lib, modePage, connectMenu) {
  const mode = modePage.firstChild.querySelector('.active')?.mode;
  if (mode !== 'single') return null;
  const config = lib.config.mode_config.single || {};
  const prefix = connectMenu ? 'connect_' : '';
  if (config[`${prefix}single_mode`] !== 'biaofeng') return null;
  return { fourBans: config[`${prefix}biaofeng_four_bans`] !== false };
}

export function refreshBiaofengRosterMenus(lib) {
  for (const refresh of panels.get(lib) || []) refresh();
}

export function attachBiaofengRosterMenu(lib, page, modePage, connectMenu) {
  if (attached.has(page)) return attached.get(page);
  const document = page.ownerDocument;
  if (!document.getElementById('biaofeng-roster-style')) {
    const style = document.createElement('link');
    style.id = 'biaofeng-roster-style';
    style.rel = 'stylesheet';
    style.href = new URL('./biaofeng-roster-menu.css', import.meta.url).href;
    document.head.appendChild(style);
  }
  const panel = document.createElement('section');
  panel.className = 'biaofeng-roster';
  panel.setAttribute('aria-label', '标风 1v1 实际将池');
  panel.hidden = true;
  page.appendChild(panel);
  lib.setScroll?.(panel);
  let rendered;
  function node(tag, className, text, parent) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element);
    return element;
  }
  function render(fourBans) {
    panel.replaceChildren();
    const roster = getBiaofengRoster({ fourBans });
    node('h2', 'bfr-title', `标风 1v1 · ${roster.length} 将`, panel);
    node('p', 'bfr-description', '本模式固定使用以下武将。开局随机抽取六明四暗，双方轮流选将，无需开启其他武将包。', panel);
    node('p', 'bfr-bans', fourBans ? '四禁开启：曹操、孙权、吕蒙、华佗不进入将池。' : '四禁关闭：使用全部 33 名标准与风包武将。', panel);
    for (const [pack, title] of [['standard', '经典标准包'], ['wind', '风包']]) {
      const heroes = roster.filter(hero => hero.pack === pack);
      node('h3', 'bfr-group', `${title} · ${heroes.length} 将`, panel);
      const grid = node('div', 'bfr-grid', undefined, panel);
      for (const hero of heroes) {
        const card = node('article', 'bfr-hero', undefined, grid);
        card.dataset.character = hero.id;
        const portrait = node('img', 'bfr-portrait', undefined, card);
        portrait.src = new URL(`../image/character/${hero.nativeId}.jpg`, import.meta.url).href;
        portrait.alt = '';
        portrait.loading = 'lazy';
        node('span', 'bfr-name', hero.name, card);
        node('span', 'bfr-stats', `${factions[hero.faction]} · ${hero.hp} 体力`, card);
      }
    }
  }
  function refresh() {
    const selection = getBiaofengMenuSelection(lib, modePage, connectMenu);
    page.classList.toggle('biaofeng-roster-mode', !!selection);
    panel.hidden = !selection;
    if (selection && rendered !== selection.fourBans) {
      rendered = selection.fourBans;
      render(rendered);
    }
  }
  if (!panels.has(lib)) panels.set(lib, new Set());
  panels.get(lib).add(refresh);
  attached.set(page, refresh);
  refresh();
  return refresh;
}
