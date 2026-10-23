import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

async function runtime(t) {
  const lib = { skill: {}, translate: {}, config: {}, filter: { notMe: () => true } };
  const log = [];
  const game = {
    log: (...args) => log.push(['log', ...args]),
    broadcastAll() {},
    delay: async () => {}, delayx: async () => {},
    asyncDraw: async targets => { for (const target of targets) await target.draw(); },
    countPlayer: callback => game.players.filter(callback).length,
    players: [],
    filterPlayer(callback) {
      const result = game.players.filter(callback);
      result.sortBySeat = () => result;
      return result;
    },
  };
  const get = {
    suit: card => card.suit, number: card => card.number,
    translation: item => typeof item === 'string' ? item : item?.name || '',
    is: { sameNature: (left, right) => left.nature === right.nature },
    attitude: () => -1, value: () => 5,
  };
  const _status = { event: {}, currentPhase: null };
  const context = vm.createContext({ lib, game, get, ui: { ordering: {} }, _status, setTimeout, console });
  vm.runInContext('Array.prototype.add = function(item) { if (!this.includes(item)) this.push(item); return this; };', context);
  for (const pack of ['standard', 'shenhua', 'old']) {
    let source;
    try { source = await readFile(new URL(`noname/apps/core/character/${pack}/skill.js`, root), 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      t.skip('Run npm run setup to obtain the pinned original skill definitions.');
      return;
    }
    const skills = vm.runInContext(`(() => {${source.replace(/^import .+;\n/gm, '').replace('export default skills;', 'return skills;')} })()`, context);
    Object.assign(lib.skill, skills);
  }
  const source = await readFile(new URL('additions/biaofeng-skills.js', root), 'utf8');
  const install = vm.runInContext(source.replace(/^import .+;\n/gm, '').replace(/^export /gm, '') + '\ninstallBiaofengSkills', context);
  return { lib, game, get, _status, context, install, log };
}

function result(value) {
  return { set() { return this; }, async forResult() { return value; } };
}

test('isolated skill installation preserves the original definitions and fails clearly when a pack is missing', async t => {
  const env = await runtime(t);
  if (!env) return;
  const { lib, install } = env;
  const oldFanjian = lib.skill.fanjian;
  const oldLiegong = lib.skill.liegong;
  const oldGuhuo = lib.skill.old_guhuo;
  oldGuhuo.skill_id = 'old_guhuo';
  oldGuhuo.subSkill.guess.sourceSkill = 'old_guhuo';
  const originalGuess = oldGuhuo.subSkill.guess.content;
  install(lib);
  const installed = lib.skill.biaofeng_guhuo;
  install(lib);
  assert.equal(lib.skill.biaofeng_guhuo, installed);
  assert.equal(lib.skill.fanjian, oldFanjian);
  assert.equal(lib.skill.liegong, oldLiegong);
  assert.equal(lib.skill.old_guhuo, oldGuhuo);
  assert.equal(oldGuhuo.subSkill.guess.content, originalGuess);
  assert.notEqual(installed.chooseButton, oldGuhuo.chooseButton);
  assert.notEqual(installed.subSkill.guess, oldGuhuo.subSkill.guess);
  assert.equal(lib.skill.biaofeng_guhuo_guess, installed.subSkill.guess);
  assert.equal(installed.skill_id, 'biaofeng_guhuo');
  assert.equal(installed.subSkill.guess.sourceSkill, 'biaofeng_guhuo');
  assert.equal(oldGuhuo.subSkill.guess.sourceSkill, 'old_guhuo');
  assert.throws(() => install({ skill: {}, translate: {} }), /标风技能未载入/);
});

async function fanjianScenario(env, { suit = 'spade', choice = 'heart2', die = false, replace = false, moveCard = false } = {}) {
  const events = [];
  const card = { name: 'tao', suit, position: 'zhouyu-hand' };
  vm.runInContext('Math.random = () => 0.75;', env.context);
  const player = {
    name: 'zhouyu',
    getCards(position) {
      assert.equal(position, 'h');
      assert.deepEqual(events, ['suit'], 'sample after the suit is locked');
      events.push('random');
      return [{ name: 'sha', suit: 'club' }, card];
    },
    async showCards(cards) { assert.equal(cards[0], card); events.push('show'); },
  };
  let alive = true;
  const target = {
    name: 'simayi',
    chooseControl() { events.push('suit'); return result({ control: choice }); },
    chat() {},
    choosePlayerCard() { assert.fail('the target must not choose from known hand cards'); },
    async damage() {
      assert.ok(!events.includes('gain'), 'chosen Peach is unavailable during damage/self-rescue');
      assert.equal(card.position, 'zhouyu-hand');
      events.push('damage');
      if (moveCard) card.position = 'discard';
      if (die) alive = false;
      if (replace) { this.name = 'guanyu'; alive = true; }
    },
    isIn: () => alive,
    async gain(received) { assert.equal(received, card); events.push('gain'); card.position = 'target-hand'; },
  };
  await env.lib.skill.biaofeng_fanjian.content({ target }, {}, player);
  return { events, card };
}

test('classic Fanjian reveals then damages before acquisition, including a card moved during damage', async t => {
  const env = await runtime(t); if (!env) return;
  env.install(env.lib);
  const wrong = await fanjianScenario(env, { moveCard: true });
  assert.deepEqual(wrong.events, ['suit', 'random', 'show', 'damage', 'gain']);
  assert.equal(wrong.card.position, 'target-hand');
  const correct = await fanjianScenario(env, { suit: 'heart' });
  assert.deepEqual(correct.events, ['suit', 'random', 'show', 'gain']);
});

test('classic Fanjian never transfers the selected card to a dead or replacement hero', async t => {
  const env = await runtime(t); if (!env) return;
  env.install(env.lib);
  for (const options of [{ die: true }, { replace: true }]) {
    const { events, card } = await fanjianScenario(env, options);
    assert.deepEqual(events, ['suit', 'random', 'show', 'damage']);
    assert.equal(card.position, 'zhouyu-hand');
  }
});

test('classic Liegong uses the original hand-count condition only in the owner play phase', async t => {
  const env = await runtime(t); if (!env) return;
  env.install(env.lib);
  let inPhase = true;
  let handCount = 4;
  const player = { hp: 4, isPhaseUsing: () => inPhase, getAttackRange: () => 1 };
  const event = { card: { name: 'sha' }, target: { countCards: () => handCount } };
  const skill = env.lib.skill.biaofeng_liegong;
  assert.equal(skill.filter(event, player), true);
  handCount = 2;
  assert.equal(skill.filter(event, player), false);
  handCount = 1;
  assert.equal(skill.filter(event, player), true);
  inPhase = false;
  assert.equal(skill.filter(event, player), false);
  assert.equal(skill.ai.skillTagFilter(player, 'directHit_ai', event), false);
  inPhase = true;
  event.card.name = 'juedou';
  assert.equal(skill.filter(event, player), false);
});

async function guhuoScenario(env, { hp, truthful, suit, challenge, replaceOnLoss = false, extraTarget = false }) {
  const events = [];
  const actual = { name: truthful ? 'sha' : 'shan', suit, number: 7 };
  const player = { name: 'yuji', isIn: () => true, popup() {}, lose() { events.push('put-down'); return Promise.resolve(); } };
  const target = {
    name: 'zhoutai', hp, isIn: () => true, popup() {}, addExpose() {},
    chooseButton() {
      events.push('ask');
      const choice = result({ links: [['', '', challenge ? 'reguhuo_betray' : 'reguhuo_ally']] });
      choice.set = function (key, value) { if (key === 'ai') env.questionAI = value; return this; };
      return choice;
    },
    async draw() { events.push('draw'); },
    async loseHp() { events.push('loseHp'); if (replaceOnLoss) this.name = 'guanyu'; },
  };
  env.game.players = [player, target];
  const trigger = {
    skill: 'biaofeng_guhuo_backup', name: 'useCard', card: { name: 'sha' }, cards: [actual], targets: extraTarget ? [target, player] : [target],
    cancel() { events.push('cancel'); },
    getParent() { return { goto() { events.push('retry'); } }; },
  };
  env.lastTrigger = trigger;
  await env.lib.skill.biaofeng_guhuo_guess.content({}, trigger, player);
  return events;
}

test('old Guhuo permits questions only at positive HP, including negative-HP Buqu', async t => {
  const env = await runtime(t); if (!env) return;
  env.install(env.lib);
  for (const hp of [-3, -1, 0]) {
    assert.deepEqual(await guhuoScenario(env, { hp, truthful: false, suit: 'spade', challenge: true }), ['put-down']);
  }
  assert.deepEqual(await guhuoScenario(env, { hp: 1, truthful: false, suit: 'heart', challenge: true }), ['put-down', 'ask', 'draw', 'cancel', 'retry']);
  assert.deepEqual(await guhuoScenario(env, { hp: 1, truthful: true, suit: 'heart', challenge: true }), ['put-down', 'ask', 'loseHp']);
  assert.deepEqual(await guhuoScenario(env, { hp: 1, truthful: true, suit: 'spade', challenge: true }), ['put-down', 'ask', 'loseHp', 'cancel', 'retry']);
  assert.deepEqual(await guhuoScenario(env, { hp: 1, truthful: false, suit: 'spade', challenge: false }), ['put-down', 'ask']);
  // Native online choices send this function by source text: no closure is
  // available on the other client, and an absent parent must remain harmless.
  env._status.event = { player: {}, getParent: () => ({}) };
  const remoteAI = vm.runInContext(`(${env.questionAI.toString()})`, env.context);
  assert.ok(Number.isFinite(remoteAI({ link: ['', '', 'reguhuo_betray'] })));
});

test('a truthful Guhuo cannot hit the replacement of a questioner killed by the penalty', async t => {
  const env = await runtime(t); if (!env) return;
  env.install(env.lib);
  const events = await guhuoScenario(env, { hp: 1, truthful: true, suit: 'heart', challenge: true, replaceOnLoss: true, extraTarget: true });
  assert.deepEqual(events, ['put-down', 'ask', 'loseHp']);
  assert.deepEqual(env.lastTrigger.targets.map(target => target.name), ['yuji'], 'other valid mass-card targets remain');
});

test('Guhuo backup activates only its isolated guess handler and retains the real card suit', async t => {
  const env = await runtime(t); if (!env) return;
  env.install(env.lib);
  const events = [];
  const player = { logSkill: name => events.push(name), addTempSkill: name => events.push(name) };
  const skill = env.lib.skill.biaofeng_guhuo;
  const backup = skill.chooseButton.backup([['basic', '', 'sha']], player);
  const event = { result: { card: {}, cards: [{ suit: 'heart', number: 9 }] } };
  await backup.precontent(event, {}, player);
  assert.deepEqual(events, ['biaofeng_guhuo', 'biaofeng_guhuo_guess']);
  assert.equal(event.result.card.suit, 'heart');
  assert.equal(event.result.card.number, 9);
  assert.equal(skill.subSkill.guess.filter({ skill: 'old_guhuo_backup' }), false);
  assert.equal(skill.subSkill.guess.filter({ skill: 'biaofeng_guhuo_backup' }), true);
  assert.equal(backup.viewAs.name, 'sha');
  assert.doesNotMatch(backup.ai1.toString(), /old_guhuo_backup/);
});
