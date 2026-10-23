import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { attachBiaofengRosterMenu, refreshBiaofengRosterMenus } from '../additions/biaofeng-roster-menu.js';
import { BIAOFENG_HEROES, getBiaofengRoster } from '../additions/biaofeng-data.js';
import { addBiaofengRosterMenu } from '../scripts/install-biaofeng-roster-menu.mjs';

function dom() {
  const nodes = [];
  const document = {
    createElement(tag) {
      const classes = new Set();
      const element = {
        tag, children: [], ownerDocument: document, dataset: {}, attributes: {},
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...children) { this.children = children; },
        setAttribute(name, value) { this.attributes[name] = value; },
        get firstChild() { return this.children[0]; },
        querySelector() { return this.selected; },
      };
      nodes.push(element);
      return element;
    },
    getElementById(id) { return nodes.find(node => node.id === id); },
  };
  document.head = document.createElement('head');
  return document;
}

function fixture(connectMenu) {
  const document = dom();
  const lib = { config: { mode_config: { single: { single_mode: 'normal', connect_single_mode: 'dianjiang' } }, connect_characters: ['some-disabled-pack'] } };
  const modePage = document.createElement('div');
  const modeList = document.createElement('div');
  modeList.selected = { mode: 'single' };
  modePage.appendChild(modeList);
  const page = document.createElement('div');
  const original = document.createElement('div');
  original.textContent = '2023版标准包';
  page.appendChild(original);
  page.appendChild(document.createElement('div'));
  const refresh = attachBiaofengRosterMenu(lib, page, modePage, connectMenu);
  const panel = page.children[2];
  const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
  const heroes = () => descendants(panel).filter(node => node.dataset.character).map(node => node.dataset.character);
  return { document, lib, modeList, page, panel, original, refresh, heroes };
}

for (const connectMenu of [false, true]) {
  test(`${connectMenu ? 'online' : 'local'} character tab follows the actual 29/33 roster and restores other modes`, () => {
    const env = fixture(connectMenu);
    const { lib, page, panel, modeList, original } = env;
    const config = lib.config.mode_config.single;
    const prefix = connectMenu ? 'connect_' : '';
    assert.equal(panel.hidden, true);
    config[`${prefix}single_mode`] = 'biaofeng';
    refreshBiaofengRosterMenus(lib);
    assert.equal(panel.hidden, false);
    assert.equal(page.classList.contains('biaofeng-roster-mode'), true);
    assert.deepEqual(env.heroes(), getBiaofengRoster().map(hero => hero.id));
    assert.equal(env.heroes().length, 29);
    assert.equal(env.heroes().some(id => ['std_lejin', 'std_ganfuren', 'std_huaxiong', 'sunquan'].includes(id)), false);
    config[`${prefix}biaofeng_four_bans`] = false;
    refreshBiaofengRosterMenus(lib);
    assert.equal(env.heroes().length, 33);
    assert.deepEqual(env.heroes(), BIAOFENG_HEROES.map(hero => hero.id));
    modeList.selected.mode = 'identity';
    refreshBiaofengRosterMenus(lib);
    assert.equal(panel.hidden, true);
    assert.equal(page.classList.contains('biaofeng-roster-mode'), false);
    assert.equal(page.firstChild, original);
    assert.equal(original.textContent, '2023版标准包');
    assert.deepEqual(lib.config.connect_characters, ['some-disabled-pack']);
    assert.equal(attachBiaofengRosterMenu(lib, page, { firstChild: modeList }, connectMenu), env.refresh);
    assert.equal(page.children.length, 3, 'opening the same menu does not duplicate the roster');
  });
}

test('all classic roster portraits exist in the pinned game', async () => {
  for (const hero of BIAOFENG_HEROES) {
    const image = await stat(new URL(`../noname/apps/core/image/character/${hero.nativeId}.jpg`, import.meta.url));
    assert.ok(image.isFile(), hero.name);
  }
});

test('pinned character menu hooks refresh on mode changes and menu opening without rewriting pack controls', async () => {
  const source = await readFile(new URL('../noname/apps/core/dist/noname/ui/create/menu/pages/characterPackMenu.js', import.meta.url), 'utf8');
  const modified = addBiaofengRosterMenu(source);
  assert.equal(addBiaofengRosterMenu(modified), modified);
  assert.match(modified, /setUpdateActive\(function\(node\) \{\n    refreshBiaofengRosterMenus\(lib\);/);
  assert.match(modified, /biaofengMenuUpdates.push\(attachBiaofengRosterMenu/);
  assert.match(modified, /game.saveConfig\("connect_characters", lib.config.connect_characters\)/);
  assert.throws(() => addBiaofengRosterMenu(source + source), /menu changed/);
  assert.throws(() => addBiaofengRosterMenu(source.replace('setUpdateActive(function(node)', 'setUpdateActive(function(other)')), /menu changed/);
});
