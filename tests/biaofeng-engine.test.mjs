import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as data from '../additions/biaofeng-data.js';

const plain = value => JSON.parse(JSON.stringify(value));
const classes = () => ({ add() {}, remove() {} });

async function runtime(options = {}) {
  const calls = { broadcast: [], private: [], choices: [], draws: [], over: [], native: [], finishedSkills: [] };
  const lib = {
    character: {}, characterPack: { standard: {}, shenhua: {}, old: {} }, skill: {}, translate: {},
    config: { mode: 'single' }, configOL: { mode: 'single', single_mode: 'biaofeng', biaofeng_four_bans: true },
    card: { list: [['spade', 1, 'old_pile']] }, playerOL: {},
    node: { torespond: {} }, message: { server: { reinited() { this.inited = true; } } },
    init: { onfree() {} }, setPopped() {},
  };
  for (const hero of data.BIAOFENG_HEROES) {
    const definition = { sex: hero.gender, group: hero.faction, hp: hero.hp, skills: [...hero.skills, ...hero.excludedLordSkills], isZhugong: true };
    lib.characterPack[hero.sourcePack][hero.nativeId] = definition;
    lib.character[hero.nativeId] = definition;
    for (const skill of hero.skills) lib.skill[skill] = {};
  }
  const _status = { connectMode: true, mode: 'biaofeng' };
  const game = {
    players: [], me: null,
    finishSkill: skill => calls.finishedSkills.push(skill),
    broadcastAll(fn, ...args) { calls.broadcast.push({ fn: String(fn), args }); fn(...args); },
    createEvent(name, _trigger, parent) {
      const event = { name, parent, next: [], setContent(content) { this.content = content; return this; } };
      calls.lastEvent = event;
      return event;
    },
    gameDraw(first, count) { calls.native.push('draw'); return { first, count: typeof count === 'function' ? count(first) : count }; },
    async waitForPlayer() { calls.native.push('wait'); await options.onWait?.({ lib, game, _status }); return 'native waited'; },
    loadModeAsync(name) { calls.native.push(`load:${name}`); return name; },
    over: result => calls.over.push(result),
    async cardsDiscard(cards) { calls.native.push(['discard', cards.length]); },
    async triggerEnter() {}, log() {}, addVideo() {}, resume() {},
  };
  const ui = {
    arena: { classList: classes() },
    create: {
      dialog(...args) {
        const list = args.find(arg => Array.isArray(arg) && arg[1] === 'character')?.[0] || [];
        return { buttons: list.map(link => ({ link, classList: classes() })), add() {}, close() {} };
      },
      system() { return { remove() {} }; },
    },
  };
  const get = {
    config: key => key === 'single_mode' ? lib.configOL.single_mode : key === 'biaofeng_four_bans' ? lib.configOL.biaofeng_four_bans : undefined,
    translation: value => typeof value === 'string' ? value : value?.name,
  };
  function player(id) {
    const current = {
      playerid: id, identity: null, ai: {}, storage: {}, hand: [],
      node: { identity: { dataset: { color: 'test' }, classList: classes() } },
      setIdentity() {}, isOnline() { return this !== game.me; }, isAlive() { return !this.dead; },
      send(fn, ...args) { calls.private.push({ id: this.playerid, fn: String(fn), args: plain(args) }); },
      init(name) { this.name = this.name1 = name; this.hp = this.maxHp = lib.character[name].hp; this.dead = false; },
      revive() { this.dead = false; },
      uninit() { this.name = undefined; this.storage = { counttrigger: 'old' }; },
      getCards() { return []; },
      async draw(count) { this.hand = Array.from({ length: count }, () => ({})); calls.draws.push({ id, count }); },
      chooseButtonOL(requests) {
        calls.choices.push(requests.map(([target, count, forced, dialog]) => ({ id: target.playerid, count, forced, dialog: plain(dialog) })));
        return { async forResult() {
          for (const [target] of requests) {
            const callback = () => {};
            callback._noname_waiting = true;
            lib.node.torespond[target.playerid] = callback;
          }
          await options.onChoose?.({ requests, lib, game, calls, _status });
          const results = {};
          for (const [target, count, , dialog] of requests) {
            const choices = dialog[1][0];
            results[target.playerid] = { links: [...choices].slice(-count) };
          }
          lib.node.torespond = {};
          return results;
        } };
      },
    };
    current.ws = { id, closed: false };
    lib.playerOL[id] = current;
    return current;
  }
  game.players = [player('host'), player('guest')];
  game.me = game.players[0];
  const context = vm.createContext({
    lib, game, ui, get, ai: {}, _status, ...data,
    BIAOFENG_SKILL_OVERRIDES: { fanjian: 'biaofeng_fanjian', liegong: 'biaofeng_liegong', old_guhuo: 'biaofeng_guhuo' },
    installBiaofengSkills() {},
    console, setTimeout,
  });
  vm.runInContext('Math.random = () => 0.999;', context);
  const source = await readFile(new URL('../additions/biaofeng-single.js', import.meta.url), 'utf8');
  const api = vm.runInContext(`(() => { ${source.replace(/^import .+;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')}
    return { installBiaofeng, DRAFT_ORDER, createDraft, selectDraft, selectLineup, publicSnapshot, privateSnapshot, recordDefeat };
  })()`, context);
  const original = {
    name: 'single', start() { calls.native.push('start'); return 'original start'; },
    onreinit() { calls.native.push('reinit'); },
    game: {
      chooseCharacter() { return 'original local choice'; }, chooseCharacterOL() { return 'original online choice'; },
      getState() { return Object.fromEntries(game.players.map(current => [current.playerid, { identity: current.identity }])); },
      updateState() {}, checkResult() { calls.native.push('result'); }, checkOnlineResult: current => current.isAlive(),
      getRoomInfo() { calls.native.push('room'); },
    },
    element: { player: { dieAfter() { calls.native.push('die'); }, dieAfter2() { calls.native.push('die2'); } } },
  };
  const mode = api.installBiaofeng(original);
  Object.assign(game, mode.game);
  return { ...api, lib, game, ui, get, _status, calls, mode, context };
}

test('six visible/four hidden draft follows 1–2–2–2–2–1 with private fixed lineups', async () => {
  const env = await runtime();
  const state = env.createDraft(data.getBiaofengRoster(), { random: () => 0.999 });
  assert.equal(state.board.filter(slot => slot.visible).length, 6);
  const concealed = state.board.filter(slot => !slot.visible).map(slot => slot.hero);
  for (const [identity, count] of env.DRAFT_ORDER) {
    const available = state.board.filter(slot => !slot.pickedBy).slice(-count);
    env.selectDraft(state, identity, available.map(slot => slot.token));
    const view = env.publicSnapshot(state);
    for (const secret of concealed) assert.equal(JSON.stringify(view).includes(`"${secret}"`), false, secret);
  }
  assert.deepEqual(plain([state.picks.fan.length, state.picks.zhu.length]), [5, 5]);
  assert.equal(state.stage, 'arrange');
  for (const identity of ['fan', 'zhu']) {
    const ordered = [...state.picks[identity]].reverse().slice(0, 3);
    for (const hero of ordered) env.selectLineup(state, identity, hero);
    assert.deepEqual(plain(env.privateSnapshot(state, identity).lineup), plain(ordered));
  }
  const view = env.publicSnapshot(state);
  assert.equal(view.stage, 'battle');
  assert.equal('lineups' in view, false);
  for (const identity of ['fan', 'zhu']) assert.equal(view.players[identity].active, state.lineups[identity][0]);
  assert.throws(() => env.selectLineup(state, 'fan', state.picks.fan[3]), /只能/);
});

test('invalid draft input cannot mutate or steal another player’s choices', async () => {
  const env = await runtime();
  const state = env.createDraft(data.getBiaofengRoster(), { random: () => 0.999 });
  for (const [identity, tokens] of [['zhu', [state.board[0].token]], ['fan', ['invalid']], ['fan', [state.board[0].token, state.board[1].token]]]) {
    const before = JSON.stringify(state);
    assert.throws(() => env.selectDraft(state, identity, tokens));
    assert.equal(JSON.stringify(state), before);
  }
  env.selectDraft(state, 'fan', [state.board[0].token]);
  assert.throws(() => env.selectDraft(state, 'zhu', [state.board[0].token, state.board[1].token]), /不能/);
  assert.throws(() => env.selectDraft(state, 'zhu', [state.board[1].token, state.board[1].token]), /次序或数量/);
});

async function runDraft(env) {
  const event = env.mode.game.chooseCharacterOL();
  await event.content(event);
  return env.mode.game.getState().biaofeng;
}

test('native choice requests keep dark identities and ordered reserves out of broadcasts', async () => {
  const env = await runtime();
  const view = await runDraft(env);
  assert.equal(view.stage, 'battle');
  assert.deepEqual(env.calls.choices.slice(0, 6).map(request => request[0].count), [1, 2, 2, 2, 2, 1]);
  assert.deepEqual(plain(env.calls.choices.slice(6).map(request => request.map(choice => choice.count))), [[1, 1], [1, 1], [1, 1]]);
  const dark = env.calls.private.flatMap(packet => packet.args[0]?.picks || []).filter(hero => !view.board.some(slot => slot.hero === hero));
  assert.ok(dark.length);
  const publicPackets = env.calls.broadcast.filter(packet => packet.fn.includes('receivePublic'));
  for (const packet of publicPackets) {
    const snapshot = packet.args[0];
    assert.equal('picks' in snapshot, false);
    assert.equal('lineups' in snapshot, false);
    for (const hero of dark) {
      if (!Object.values(snapshot.players).some(current => current.active === hero)) {
        assert.equal(JSON.stringify(snapshot).includes(`"${hero}"`), false);
      }
    }
  }
  const own = env.calls.private.filter(packet => packet.fn.includes('receivePrivate')).at(-1).args[0];
  assert.equal(own.identity, env.game.players[1].identity);
  assert.equal(own.lineup.length, 3);
  assert.equal(own.picks.length, 5);
  for (const request of env.calls.choices.slice(6).flat()) {
    if (request.id === 'guest') assert.ok(request.dialog[1][0].every(hero => own.picks.includes(hero)));
  }
  assert.deepEqual(Object.keys(env.calls.lastEvent).sort(), ['content', 'name', 'next', 'parent', 'setContent']);
});

test('KOF replacements follow the sealed order, reset state, draw four, and end only after third defeat', async () => {
  const env = await runtime();
  await runDraft(env);
  const player = env.game.players[1];
  const own = env.calls.private.filter(packet => packet.fn.includes('receivePrivate')).at(-1).args[0];
  assert.equal(player.name, own.lineup[0]);
  for (let death = 1; death <= 3; death++) {
    player.dead = true;
    player.storage = { counttrigger: 'old hero', oldSkillState: true };
    player.hand = [];
    env._status.event = { getParent: () => ({ name: 'dying', player, next: [], untrigger() {} }) };
    env.mode.element.player.dieAfter.call(player);
    if (death < 3) {
      assert.equal(env.calls.over.length, 0);
      env.mode.element.player.dieAfter2.call(player);
      const replacement = env.calls.lastEvent;
      assert.equal(replacement.forceDie, true);
      await replacement.content(replacement, null, player);
      assert.equal(player.name, own.lineup[death]);
      assert.equal(player.hp, player.maxHp);
      assert.deepEqual(plain(player.storage), {});
      assert.equal(player.hand.length, 4);
    } else {
      assert.equal(env.calls.over.length, 1);
      assert.equal(env.calls.over[0], true);
      assert.equal(env.mode.game.checkOnlineResult(player), false);
    }
  }
  assert.deepEqual(env.calls.draws.map(draw => draw.count), [4, 4]);
});

test('reconnect resends only the authenticated owner’s still-pending native choice', async () => {
  let checked = false;
  const env = await runtime({ async onChoose({ requests, lib, game, calls }) {
    if (checked || requests.length !== 2) return;
    checked = true;
    const guest = game.players[1];
    const before = calls.private.length;
    lib.message.server.reinited.call(guest.ws);
    const packets = calls.private.slice(before);
    assert.equal(packets.length, 2);
    assert.ok(packets.every(packet => packet.id === guest.playerid));
    assert.ok(packets[1].fn.includes('complexSelect = true'));
    const own = packets[0].args[0];
    assert.ok(packets[1].args[0][2][1][0].every(hero => own.picks.includes(hero)));

    // The first player may have answered while the other is still thinking.
    lib.node.torespond[guest.playerid] = { links: ['answered'] };
    const answeredBefore = calls.private.length;
    lib.message.server.reinited.call(guest.ws);
    assert.equal(calls.private.length - answeredBefore, 1, 'only the private snapshot; no stale prompt');
    const impostorBefore = calls.private.length;
    lib.message.server.reinited.call({ id: guest.playerid });
    assert.equal(calls.private.length, impostorBefore);
  } });
  await runDraft(env);
  assert.equal(checked, true);
});

test('native startup honors changes made in the waiting room and preserves other modes', async () => {
  let desired = 'biaofeng';
  const env = await runtime({ onWait({ lib }) { lib.configOL.single_mode = desired; } });
  env.lib.configOL.single_mode = 'normal';
  env._status.mode = 'normal';
  assert.equal(await env.mode.game.waitForPlayer(), 'native waited');
  assert.equal(env._status.mode, 'biaofeng');
  assert.equal(env.lib.card.list.length, 108);
  assert.equal(env._status.first_less, true);
  assert.equal(env._status.first_less_forced, true);
  assert.equal(env.mode.game.gameDraw({}, () => 3).count, 4);

  desired = 'normal';
  await env.mode.game.waitForPlayer();
  assert.equal(env._status.mode, 'normal');
  assert.equal(env.lib.card.list[0][2], 'old_pile');
  assert.equal(env._status.first_less, undefined);
  assert.equal(env.mode.game.gameDraw({}, () => 3).count, 3);
  assert.equal(env.mode.game.chooseCharacterOL(), 'original online choice');
  assert.equal(env.lib.character.caocao, env.lib.characterPack.standard.caocao);
  assert.equal(env.lib.character.caocao.skills.includes('hujia'), true);

  env.lib.configOL.mode = 'identity';
  env._status.mode = 'zhong';
  await env.mode.game.waitForPlayer();
  assert.equal(env._status.mode, 'zhong', 'persistent wrapper must not corrupt another mode');
});

test('native roster copies exclude lord skills and restore before loading another mode', async () => {
  const env = await runtime();
  const caocao = env.lib.character.caocao;
  env.lib.biaofeng.prepareContent();
  assert.notEqual(env.lib.character.caocao, caocao);
  assert.deepEqual(plain(env.lib.character.caocao.skills), ['jianxiong']);
  assert.deepEqual(plain(env.lib.character.zhouyu.skills), ['yingzi', 'biaofeng_fanjian']);
  assert.deepEqual(caocao.skills, ['jianxiong', 'hujia']);
  assert.equal(env.lib.character.caocao.isZhugong, false);
  assert.equal(env.game.loadModeAsync('identity'), 'identity');
  assert.equal(env.lib.character.caocao, caocao);
  assert.equal(env.lib.character.biaofeng_dark_6, undefined);
  assert.equal(env.installBiaofeng(env.mode), env.mode);
});
