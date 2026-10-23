// SPDX-License-Identifier: GPL-3.0-only
// Noname-duel-cloud, 2026-10-23. Classic draft/KOF orchestration using the native engine.
import { lib, game, ui, get, ai, _status } from 'noname';
import { BIAOFENG_HEROES, getBiaofengRoster, createBiaofengPile } from './biaofeng-data.js';
import { installBiaofengSkills, BIAOFENG_SKILL_OVERRIDES } from './biaofeng-skills.js';

export const DRAFT_ORDER = Object.freeze([
  ['fan', 1], ['zhu', 2], ['fan', 2], ['zhu', 2], ['fan', 2], ['zhu', 1],
]);
const MODE = 'biaofeng';
// Never attach this state, pending choices, or their contents to Player/GameEvent:
// native online events serialize arbitrary parent-event properties.
let match = null;
const pending = new Map();
let privateView = null;
let publicView = null;
let contentBackup = null;

function selectedMode() {
  return _status.connectMode ? lib.configOL?.single_mode : get.config('single_mode');
}

function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createDraft(roster, { fourBans = true, random = Math.random } = {}) {
  if (roster.length < 10 || new Set(roster.map(hero => hero.nativeId)).size !== roster.length) {
    throw new Error('标风将池必须包含至少十名互不重复的武将。');
  }
  return {
    stage: 'draft', fourBans, round: 0,
    board: shuffled(roster, random).slice(0, 10).map((hero, index) => ({
      token: index < 6 ? hero.nativeId : `biaofeng_dark_${index}`,
      hero: hero.nativeId, visible: index < 6, pickedBy: null,
    })),
    picks: { fan: [], zhu: [] }, lineups: { fan: [], zhu: [] },
    defeated: { fan: [], zhu: [] }, index: { fan: 0, zhu: 0 }, winner: null,
  };
}

export function selectDraft(state, identity, tokens) {
  const turn = DRAFT_ORDER[state.round];
  if (state.stage !== 'draft' || !turn || turn[0] !== identity ||
      !Array.isArray(tokens) || tokens.length !== turn[1] || new Set(tokens).size !== tokens.length) {
    throw new Error('无效的标风选将次序或数量。');
  }
  const slots = tokens.map(token => state.board.find(slot => slot.token === token && !slot.pickedBy));
  if (slots.some(slot => !slot)) throw new Error('不能选择已被选走或不存在的武将。');
  for (const slot of slots) {
    slot.pickedBy = identity;
    state.picks[identity].push(slot.hero);
  }
  if (++state.round === DRAFT_ORDER.length) state.stage = 'arrange';
}

export function selectLineup(state, identity, hero) {
  const lineup = state.lineups[identity];
  if (state.stage !== 'arrange' || !lineup || lineup.length >= 3 ||
      !state.picks[identity].includes(hero) || lineup.includes(hero)) {
    throw new Error('只能从自己的五名武将中依次选择三名不同武将。');
  }
  lineup.push(hero);
  if (state.lineups.fan.length === 3 && state.lineups.zhu.length === 3) state.stage = 'battle';
}

export function publicSnapshot(state) {
  return {
    stage: state.stage, fourBans: state.fourBans, round: state.round,
    chooser: state.stage === 'draft' ? DRAFT_ORDER[state.round]?.[0] : null,
    count: state.stage === 'draft' ? DRAFT_ORDER[state.round]?.[1] : null,
    board: state.board.map(slot => ({ token: slot.token, hero: slot.visible ? slot.hero : null, pickedBy: slot.pickedBy })),
    players: Object.fromEntries(['fan', 'zhu'].map(identity => [identity, {
      picked: state.picks[identity].length,
      active: state.stage === 'battle' || state.stage === 'finished' ? state.lineups[identity][state.index[identity]] : null,
      defeated: [...state.defeated[identity]], remaining: 3 - state.defeated[identity].length,
    }])),
    winner: state.winner,
  };
}

export function privateSnapshot(state, identity) {
  if (!['fan', 'zhu'].includes(identity)) throw new Error('Unknown player identity.');
  return {
    stage: state.stage, identity, picks: [...state.picks[identity]],
    lineup: [...state.lineups[identity]], index: state.index[identity], defeated: [...state.defeated[identity]],
  };
}

export function recordDefeat(state, identity) {
  if (state.stage !== 'battle' || !state.lineups[identity]?.length) return false;
  const hero = state.lineups[identity][state.index[identity]];
  if (state.defeated[identity].includes(hero)) return false;
  state.defeated[identity].push(hero);
  if (state.defeated[identity].length === 3) {
    state.winner = identity === 'fan' ? 'zhu' : 'fan';
    state.stage = 'finished';
  }
  return true;
}

function active() {
  const mainMode = _status.connectMode ? lib.configOL?.mode : lib.config.mode;
  return (!mainMode || mainMode === 'single') && (_status.mode === MODE || (!_status.mode && selectedMode() === MODE));
}

function restoreContent() {
  if (!contentBackup) return;
  for (const [object, key, exists, value] of contentBackup) {
    if (exists) object[key] = value;
    else delete object[key];
  }
  contentBackup = null;
  match = privateView = publicView = null;
  pending.clear();
  ui.biaofengDraft?.close();
  ui.biaofengLineup?.remove();
  delete ui.biaofengDraft;
  delete ui.biaofengLineup;
}

function prepareContent() {
  if (!contentBackup) {
    const names = [...BIAOFENG_HEROES.map(hero => hero.nativeId), ...[6, 7, 8, 9].map(index => `biaofeng_dark_${index}`)];
    const fields = [
      ...names.map(name => [lib.character, name]),
      ...[...names, 'biaofeng2', 'fan', 'fan2', 'zhu', 'zhu2'].map(name => [lib.translate, name]),
      [lib.card, 'list'], [game, 'fixedPile'],
      ...['first_less', 'first_less_forced', 'characterlist'].map(name => [_status, name]),
    ];
    contentBackup = fields.map(([object, key]) => [object, key, Object.hasOwn(object, key), object[key]]);
  }
  _status.mode = MODE;
  installBiaofengSkills(lib);
  for (const skill of Object.values(BIAOFENG_SKILL_OVERRIDES)) game.finishSkill(skill);
  for (const hero of BIAOFENG_HEROES) {
    const original = lib.characterPack[hero.sourcePack]?.[hero.nativeId];
    if (!original) throw new Error(`标风武将包未加载：${hero.sourcePack}/${hero.nativeId}`);
    for (const skill of hero.skills) {
      if (!lib.skill[skill]) throw new Error(`标风原生技能未加载：${skill}`);
    }
    // Copy from the original pack, never from single.characterSingle's revised heroes.
    lib.character[hero.nativeId] = {
      ...original, sex: hero.gender, group: hero.faction, hp: hero.hp, maxHp: hero.hp,
      skills: hero.skills.map(skill => BIAOFENG_SKILL_OVERRIDES[skill] || skill), isZhugong: false,
    };
    lib.translate[hero.nativeId] = hero.name;
  }
  for (let index = 6; index < 10; index++) {
    const name = `biaofeng_dark_${index}`;
    lib.character[name] = { sex: 'unknown', group: 'qun', hp: 0, skills: [], img: 'image/character/hidden_image.jpg' };
    lib.translate[name] = `暗将${index - 5}`;
  }
  lib.translate.biaofeng2 = '标风 1v1';
  lib.translate.fan = lib.translate.fan2 = '先选';
  lib.translate.zhu = lib.translate.zhu2 = '后选';
  // Native standard card logic deliberately treats only "normal" as new 1v1.
  game.fixedPile = true;
  lib.card.list = createBiaofengPile();
  _status.first_less = true;
  _status.first_less_forced = true;
}

function receivePublic(view) {
  publicView = view;
  if (ui.biaofengDraft) {
    ui.biaofengDraft.close();
    delete ui.biaofengDraft;
  }
  if (view.stage === 'draft') {
    const who = view.chooser === game.me?.identity ? '你' : '对手';
    const dialog = ui.create.dialog(`标风 1v1：${who}选择${view.count}名武将`, [view.board.map(slot => slot.token), 'character']);
    for (const button of dialog.buttons) {
      const slot = view.board.find(item => item.token === button.link);
      if (slot.pickedBy) button.classList.add(slot.pickedBy === game.me?.identity ? 'selectedx' : 'glow');
    }
    ui.biaofengDraft = dialog;
  }
}

function receivePrivate(view) {
  privateView = view;
  if (!ui.biaofengLineup) {
    ui.biaofengLineup = ui.create.system('我的阵容', null, true);
    lib.setPopped(ui.biaofengLineup, function () {
      return lib.biaofeng.lineupDialog();
    }, 360);
  }
}

function lineupDialog() {
  const dialog = ui.create.dialog('hidden');
  dialog.add('我的武将（仅自己可见）');
  if (!privateView) return dialog;
  if (privateView.lineup.length) {
    privateView.lineup.forEach((hero, index) => {
      const status = privateView.stage === 'battle' || privateView.stage === 'finished'
        ? privateView.defeated.includes(hero) ? '（已阵亡）' : index === privateView.index ? '（当前出场）' : '（后备）'
        : '';
      dialog.add(`${index + 1}. ${get.translation(hero)}${status}`);
    });
  }
  dialog.add([privateView.picks, 'character']);
  return dialog;
}

function sendPrivate(player) {
  if (!match || !['fan', 'zhu'].includes(player.identity)) return;
  const view = privateSnapshot(match, player.identity);
  if (player === game.me) receivePrivate(view);
  else if (player.isOnline()) player.send(function (snapshot) { lib.biaofeng.receivePrivate(snapshot); }, view);
}

function publish() {
  const view = publicSnapshot(match);
  game.broadcastAll(function (snapshot) { lib.biaofeng.receivePublic(snapshot); }, view);
  for (const player of [game.fan, game.zhu]) sendPrivate(player);
}

function normalizedLinks(result, allowed, count) {
  const links = result?.links;
  return Array.isArray(links) && links.length === count && new Set(links).size === count && links.every(link => allowed.includes(link))
    ? [...links] : shuffled(allowed).slice(0, count);
}

async function choosePrivately(requests) {
  for (const [player, ...args] of requests) pending.set(player.playerid, args);
  try {
    // Native chooseButtonOL sends each client ONLY that client's own args; no result callback broadcasts choices.
    return await game.me.chooseButtonOL(requests).forResult();
  } finally {
    for (const [player] of requests) pending.delete(player.playerid);
  }
}

async function chooseBiaofeng() {
  ui.arena.classList.add('choose-character');
  const players = shuffled(game.players);
  game.broadcastAll(function (fan, zhu) {
    lib.biaofeng.prepareContent();
    game.fan = fan; game.zhu = zhu;
    fan.identity = 'fan'; zhu.identity = 'zhu';
    fan.enemy = zhu; zhu.enemy = fan;
    for (const current of [fan, zhu]) {
      current.side = current === zhu;
      current.isZhu = false;
      current.identityShown = true;
      current.ai.shown = 1;
      current.setIdentity();
      current.node.identity.classList.remove('guessing');
    }
  }, players[0], players[1]);
  const fourBans = (_status.connectMode ? lib.configOL.biaofeng_four_bans : get.config('biaofeng_four_bans')) !== false;
  match = createDraft(getBiaofengRoster({ fourBans }), { fourBans });
  privateView = null;
  _status.characterlist = [];
  lib.init.onfree();
  publish();

  for (const [identity, count] of DRAFT_ORDER) {
    const chooser = game[identity];
    const allowed = match.board.filter(slot => !slot.pickedBy).map(slot => slot.token);
    const results = await choosePrivately([[chooser, count, true, [`选择${count}名武将（暗将选中后仅你可见）`, [allowed, 'character']]]]);
    selectDraft(match, identity, normalizedLinks(results?.[chooser.playerid], allowed, count));
    publish();
  }
  // Three one-card choices make the fixed order unambiguous, independent of UI button ordering.
  for (let index = 0; index < 3; index++) {
    const requests = [game.fan, game.zhu].map(current => [
      current, 1, true,
      [`秘密选择第${index + 1}位${index === 0 ? '（首发）' : '（后备）'}武将，确认后顺序固定`,
        [match.picks[current.identity].filter(hero => !match.lineups[current.identity].includes(hero)), 'character']],
    ]);
    const results = await choosePrivately(requests);
    for (const [current, , , dialog] of requests) {
      selectLineup(match, current.identity, normalizedLinks(results?.[current.playerid], dialog[1][0], 1)[0]);
    }
    publish();
  }
  game.broadcastAll(function (fan, fanHero, zhu, zhuHero) {
    fan.init(fanHero); zhu.init(zhuHero);
    fan.isZhu = zhu.isZhu = false;
    ui.arena.classList.remove('choose-character');
  }, game.fan, match.lineups.fan[0], game.zhu, match.lineups.zhu[0]);
}

function chooseEvent() {
  return game.createEvent('chooseCharacter').setContent(chooseBiaofeng);
}

/** Finish the old hero's continuation without stopping the opponent's phase. */
export function finishOldHeroEvents(replacement, player) {
  const chain = [];
  const seen = new Set([replacement]);
  let current = replacement.parent;
  while (current && !seen.has(current)) {
    seen.add(current); chain.push(current);
    if (current.name === 'phase') break;
    current = current.parent;
  }
  const dying = chain.find(event => event.name === 'dying');
  dying?.parent?.untrigger(false, player);
  const finishQueued = event => {
    if (seen.has(event)) return;
    seen.add(event);
    event.finish();
    for (const next of event.next || []) finishQueued(next);
  };
  for (const event of chain) {
    if (event.player !== player) continue;
    event.untrigger?.(false, player);
    // Damage still owes its living source damageSource (e.g. 狂骨). Suppress the
    // dead victim's triggers, but do not cancel the engine's damage resolution.
    if (['die', 'dying', 'damage', 'loseHp', 'changeHp'].includes(event.name)) continue;
    event.finish();
    // finish() alone does not empty native GameEvent.next: fatal Kurou can already have a draw queued.
    for (const next of event.next || []) finishQueued(next);
  }
}

async function replaceBiaofeng(event, trigger, player) {
  if (!match || match.stage !== 'battle') return;
  const identity = player.identity;
  const index = match.defeated[identity].length;
  if (index >= 3 || index <= match.index[identity]) return;
  finishOldHeroEvents(event, player);
  const leftovers = player.getCards('hejsx');
  if (leftovers.length) await game.cardsDiscard(leftovers);
  match.index[identity] = index;
  const name = match.lineups[identity][index];
  const color = player.node.identity.dataset.color;
  game.broadcastAll(function (current, hero, identityColor) {
    current.revive(null, false);
    current.uninit();
    current.storage = {};
    current.init(hero);
    current.isZhu = false;
    current.node.identity.dataset.color = identityColor;
  }, player, name, color);
  game.log(player, '出场');
  await player.draw(4);
  game.addVideo('reinit', player, [name, color]);
  await game.triggerEnter(player);
  publish();
}

function installReconnect() {
  if (lib.biaofengReconnectInstalled) return;
  lib.biaofengReconnectInstalled = true;
  const original = lib.message.server.reinited;
  lib.message.server.reinited = function (...args) {
    original.apply(this, args);
    if (!active() || !match) return;
    const player = lib.playerOL[this.id];
    if (!player || player.ws !== this) return;
    sendPrivate(player);
    const choice = pending.get(this.id);
    const waiter = lib.node?.torespond?.[this.id];
    if (choice && (waiter === '_noname_waiting' || (typeof waiter === 'function' && waiter._noname_waiting))) player.send(function (choiceArgs) {
      const next = game.me.chooseButton(...choiceArgs);
      next.complexSelect = true;
      game.resume();
    }, choice);
  };
}

export default function installBiaofeng(mode) {
  if (mode.biaofengInstalled) return mode;
  mode.biaofengInstalled = true;
  lib.biaofeng = {
    prepareContent, restoreContent, receivePublic, receivePrivate, lineupDialog,
    incarnation(player) { return match?.index[player.identity] ?? -1; },
  };
  installReconnect();
  if (!lib.biaofengModeLoaderInstalled) {
    lib.biaofengModeLoaderInstalled = true;
    const loadModeAsync = game.loadModeAsync;
    game.loadModeAsync = function (name, ...args) {
      if (name !== 'single') restoreContent();
      return loadModeAsync.call(this, name, ...args);
    };
  }
  const original = {
    start: mode.start, onreinit: mode.onreinit,
    waitForPlayer: game.waitForPlayer, gameDraw: game.gameDraw,
    chooseCharacter: mode.game.chooseCharacter, chooseCharacterOL: mode.game.chooseCharacterOL,
    getState: mode.game.getState, updateState: mode.game.updateState,
    checkResult: mode.game.checkResult, checkOnlineResult: mode.game.checkOnlineResult,
    getRoomInfo: mode.game.getRoomInfo,
    dieAfter: mode.element.player.dieAfter, dieAfter2: mode.element.player.dieAfter2,
  };
  mode.start = async function (event, trigger, player) {
    // Online rooms may change submode while waiting. Prepare only AFTER the native waiting event.
    _status.mode = selectedMode();
    if (!_status.connectMode && _status.mode === MODE) prepareContent();
    else if (_status.mode !== MODE) restoreContent();
    return original.start.call(this, event, trigger, player);
  };
  mode.game.waitForPlayer = async function (...args) {
    const result = await original.waitForPlayer.apply(this, args);
    if (lib.configOL.mode !== 'single') return result;
    _status.mode = lib.configOL.single_mode;
    if (_status.mode === MODE) {
      lib.configOL.number = 2;
      lib.configOL.change_card = false;
      prepareContent();
    } else restoreContent();
    return result;
  };
  mode.game.gameDraw = function (first, count, ...args) {
    return original.gameDraw.call(this, first, active() ? () => 4 : count, ...args);
  };
  mode.onreinit = function (...args) {
    _status.mode = selectedMode();
    if (_status.mode === MODE) return prepareContent();
    restoreContent();
    return original.onreinit?.apply(this, args);
  };
  for (const name of ['chooseCharacter', 'chooseCharacterOL']) {
    mode.game[name] = function (...args) {
      return active() ? chooseEvent() : original[name].apply(this, args);
    };
  }
  mode.game.getState = function (...args) {
    const state = original.getState.apply(this, args);
    if (active()) state.biaofeng = match ? publicSnapshot(match) : publicView;
    return state;
  };
  mode.game.updateState = function (state) {
    original.updateState.call(this, state);
    if (active() && state.biaofeng) {
      for (const current of Object.values(lib.playerOL)) {
        if (['fan', 'zhu'].includes(current.identity)) game[current.identity] = current;
      }
      if (game.fan && game.zhu) { game.fan.enemy = game.zhu; game.zhu.enemy = game.fan; }
      receivePublic(state.biaofeng);
    }
  };
  mode.game.checkResult = function (...args) {
    if (!active()) return original.checkResult.apply(this, args);
    if (match?.winner) game.over((game.me._trueMe || game.me).identity === match.winner);
  };
  mode.game.checkOnlineResult = function (player) {
    return active() && match?.winner ? player.identity === match.winner : original.checkOnlineResult.call(this, player);
  };
  mode.game.getRoomInfo = function (intro) {
    if (!active()) return original.getRoomInfo.call(this, intro);
    intro.add('<div class="text chat">标风 1v1：六明四暗，1–2–2–2–2–1选将，各取三将并固定出场顺序。</div>');
    intro.add(`<div class="text chat">四禁：${lib.configOL.biaofeng_four_bans === false ? '关闭（33将）' : '开启（29将）'}；108张标准+EX；初始及换将各摸四张。</div>`);
    intro.add('<div class="text chat">后选方先行动，首回合少摸一张；无主公技、主公加血或击杀奖励。</div>');
  };
  mode.element.player.dieAfter = function (...args) {
    if (!active()) return original.dieAfter.apply(this, args);
    if (match && recordDefeat(match, this.identity)) {
      publish();
      if (match.winner) game.checkResult();
    }
  };
  mode.element.player.dieAfter2 = function (...args) {
    if (!active()) return original.dieAfter2.apply(this, args);
    if (!match || match.stage !== 'battle') return;
    const next = game.createEvent('replacePlayerBiaofeng', false, _status.event.getParent());
    next.player = this;
    next.forceDie = true;
    next.setContent(replaceBiaofeng);
  };
  return mode;
}
