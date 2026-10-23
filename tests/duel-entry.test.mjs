import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import registerDuelEntry from '../additions/duel-entry.js';
import { addDuelEntryBoot } from '../scripts/install-duel-entry.mjs';
import { addQuickDuelBoot } from '../scripts/install-quick-duel.mjs';

function fixture(query = '?play=ai') {
  const calls = { saved: [], started: [], buttons: [] };
  const element = () => ({ style: {}, children: [], setAttribute() {}, append(...children) { this.children.push(...children); }, get firstChild() { return this.children[0]; }, remove() { this.removed = true; } });
  const document = { createElement: element, documentElement: element() };
  const lib = { onload: [], init: {}, config: {}, imported: { mode: {
    single: { async start(...args) { calls.started.push(['single', ...args]); return 'local game'; } },
    connect: { async start() { calls.started.push(['connect']); } },
  } } };
  const game = { saveConfig: (...args) => calls.saved.push(args), connect() { assert.fail('Local entry must not connect to a lobby'); } };
  const ui = { create: { system: (...args) => calls.buttons.push(args) } };
  return { lib, game, ui, _status: {}, document, location: { href: `https://game.example/index.html${query}` }, calls };
}

test('explicit AI boot overrides stale saved connect mode after preferences load, before native mode import', async () => {
  const env = fixture();
  registerDuelEntry(env);
  const source = addDuelEntryBoot(addQuickDuelBoot('(async () => {\n  await loadConfig();\n  continueBoot();\n})();'));
  assert.equal(addDuelEntryBoot(source), source);
  assert.equal(addQuickDuelBoot(source), source, 'installers remain idempotent together');
  const saved = { mode: 'connect', characters: ['extra'], cards: ['guozhan'], mode_config: { single: { single_mode: 'dianjiang', biaofeng_four_bans: false }, connect: { read_clipboard: true } }, reconnect_info: ['old-room'], directstartmode: 'identity' };
  await vm.runInNewContext(source, {
    lib: env.lib,
    async loadConfig() { env.lib.config = structuredClone(saved); },
    continueBoot() {
      assert.equal(env.lib.config.mode, 'single');
      assert.equal(env.lib.config.mode_config.single.single_mode, 'biaofeng');
      assert.equal(env.lib.config.mode_config.single.biaofeng_four_bans, true);
      assert.equal(env.lib.config.show_splash, 'off');
      assert.equal(env.lib.config.confirm_exit, false);
      assert.equal(env.lib.config.mode_config.connect.read_clipboard, false);
      assert.equal(env.lib.config.reconnect_info, undefined);
      assert.equal(env.lib.config.directstartmode, undefined);
      assert.equal(env._status.connectMode, false);
      assert.deepEqual(env.lib.config.characters, ['standard', 'shenhua', 'old']);
      assert.deepEqual(env.lib.config.cards, ['standard']);
    },
  });
  assert.equal(saved.mode, 'connect');
  assert.deepEqual(env.calls.saved, []);
  env.game.saveConfig('mode', 'single');
  env.game.saveConfig('volume_audio', 3);
  assert.deepEqual(env.calls.saved, [['volume_audio', 3]]);
  for (const callback of env.lib.onload) callback();
  const loading = env.document.documentElement.children[0];
  assert.equal(await env.lib.imported.mode.single.start('event'), 'local game');
  assert.equal(loading.removed, true);
  assert.deepEqual(env.calls.started, [['single', 'event']]);
  assert.equal(env.calls.buttons[0][0], '返回入口');
});

test('hall remains explicit; quick invitations and unrelated URLs are not changed by local boot', async () => {
  for (const query of ['', '?quick=host', '?play=ai&quick=host', '?play=unknown', '?play=ai&play=hall']) {
    const env = fixture(query);
    registerDuelEntry(env);
    assert.equal(env.lib.duelEntry, undefined);
    assert.deepEqual(env.lib.config, {});
    assert.equal(env.document.documentElement.children.length, 0);
  }
  const env = fixture('?play=hall');
  registerDuelEntry(env);
  env.lib.duelEntry.prepare();
  assert.equal(env.lib.config.mode, 'connect');
  for (const callback of env.lib.onload) callback();
  await env.lib.imported.mode.connect.start();
  assert.deepEqual(env.calls.started, [['connect']]);
});

test('slow startup stays inline and home offers direct links without running the game', async () => {
  const env = fixture();
  registerDuelEntry(env);
  env.lib.init.reset();
  assert.match(env.document.documentElement.children[0].firstChild.textContent, /稍慢/);
  const home = await readFile(new URL('../additions/duel-home.html', import.meta.url), 'utf8');
  assert.match(home, /href="\/\?play=ai"/);
  assert.match(home, /href="\/\?quick=host"/);
  assert.match(home, /href="\/\?play=hall"/);
  assert.doesNotMatch(home, /<script/i);
});
