// SPDX-License-Identifier: GPL-3.0-only
// Modified by noname-duel-cloud (2026-10-23).
// Optional classic rules; original skills remain unchanged for every other mode.
// Guhuo animation/resolution below is adapted from libnoname/noname old/skill.js,
// pinned revision 90b58bb9934edb1712fd187a80c8323b7aeabaf3 (GPL-3.0-only).
import { lib, game, ui, get, _status } from "noname";

export const BIAOFENG_SKILL_OVERRIDES = Object.freeze({
  fanjian: 'biaofeng_fanjian',
  liegong: 'biaofeng_liegong',
  old_guhuo: 'biaofeng_guhuo',
});

const installed = new WeakSet();

async function classicFanjian(event, trigger, player) {
  const target = event.target;
  const identity = target.name;
  const { control } = await target.chooseControl({
    controls: ['heart2', 'diamond2', 'club2', 'spade2'],
    ai() { return ['heart2', 'diamond2', 'club2', 'spade2'][Math.floor(Math.random() * 4)]; },
  }).forResult();
  game.log(target, `选择了${get.translation(control)}`);
  target.chat(`我选${get.translation(control)}`);
  // Sample uniformly on the authoritative host, even if a hand card is already
  // known to the target. A guessed 桃 is unavailable for this damage's rescue.
  // The card remains Zhou Yu's during damage triggers.
  const hand = player.getCards('h');
  const card = hand[Math.floor(Math.random() * hand.length)];
  if (!card) return;
  const suit = get.suit(card, player);
  await player.showCards([card], `${get.translation(player)}的反间`);
  if (suit + '2' !== control) await target.damage({ nocard: true });
  // The same Player object is reused for the next hero. Do not grant the card to
  // that new incarnation. No duplicate characters exist in a classic draft.
  if (target.isIn() && target.name === identity) {
    // Native gain can recover the chosen card even if 刚烈 discarded it or 反馈
    // moved it during damage. If the victim died it stays wherever it now is.
    await target.gain(card, 'gain2');
  }
}

function classicGuhuoBackup(links, player) {
  const backup = lib.skill.old_guhuo.chooseButton.backup(links, player);
  return {
    ...backup,
    ai1(card) {
      const player = _status.event.player;
      const enemyNum = game.countPlayer(current => current !== player && current.hp > 0 && (get.realAttitude || get.attitude)(current, player) < 0);
      const cardx = lib.skill.biaofeng_guhuo_backup.viewAs;
      if (enemyNum) {
        if (card.name === cardx.name && (card.name !== 'sha' || get.is.sameNature(card, cardx))) return 2 + Math.random() * 3;
        if (lib.skill.biaofeng_guhuo_backup.aiUse < 0.5 && !player.isDying()) return 0;
      }
      return 6 - get.value(card);
    },
    async precontent(event, trigger, player) {
      player.logSkill('biaofeng_guhuo');
      player.addTempSkill('biaofeng_guhuo_guess');
      const [card] = event.result.cards;
      event.result.card.suit = get.suit(card);
      event.result.card.number = get.number(card);
    },
  };
}

function classicGuhuoCheck(button) {
  const player = _status.event.player;
  const enemyNum = game.countPlayer(current => current !== player && current.hp > 0 && (get.realAttitude || get.attitude)(current, player) < 0);
  const card = { name: button.link[2], nature: button.link[3] };
  const val = _status.event.getParent().type === 'phase' ? player.getUseValue(card) : 1;
  if (val <= 0) return 0;
  if (enemyNum) {
    if (!player.hasCard(cardx => card.name === cardx.name && (card.name !== 'sha' || get.is.sameNature(card, cardx)), 'hs')) {
      if (get.value(card, player, 'raw') < 6) return Math.sqrt(val) * (0.25 + Math.random() / 1.5);
      if (enemyNum <= 2) return Math.sqrt(val) / 1.5;
      return 0;
    }
    return 3 * val;
  }
  return val;
}

export function installBiaofengSkills(targetLib = lib) {
  if (installed.has(targetLib)) return;
  for (const name of Object.keys(BIAOFENG_SKILL_OVERRIDES)) {
    if (!targetLib.skill[name]) throw new Error(`标风技能未载入：${name}`);
  }
  const fanjian = targetLib.skill.fanjian;
  const liegong = targetLib.skill.liegong;
  const guhuo = targetLib.skill.old_guhuo;
  targetLib.skill.biaofeng_fanjian = { ...fanjian, skill_id: 'biaofeng_fanjian', audio: 'fanjian', content: classicFanjian };
  targetLib.skill.biaofeng_liegong = {
    ...liegong,
    skill_id: 'biaofeng_liegong',
    audio: 'liegong',
    filter(event, player) {
      return player.isPhaseUsing() && lib.skill.liegong.filter(event, player);
    },
    ai: {
      ...liegong.ai,
      skillTagFilter(player, tag, arg) {
        if (!player.isPhaseUsing()) return false;
        return lib.skill.liegong.ai.skillTagFilter(player, tag, arg);
      },
    },
  };
  const guess = {
    ...guhuo.subSkill.guess,
    skill_id: 'biaofeng_guhuo_guess', sourceSkill: 'biaofeng_guhuo',
    filter(event) { return typeof event.skill === 'string' && event.skill.startsWith('biaofeng_guhuo_'); },
    content: resolveBiaofengGuhuo,
  };
  targetLib.skill.biaofeng_guhuo = {
    ...guhuo,
    skill_id: 'biaofeng_guhuo',
    audio: 'old_guhuo',
    chooseButton: { ...guhuo.chooseButton, check: classicGuhuoCheck, backup: classicGuhuoBackup },
    subSkill: { guess },
  };
  // Register the temp skill explicitly as preparation may occur after the native
  // finishCards pass. The native finishSkill pass can safely see it again.
  targetLib.skill.biaofeng_guhuo_guess = guess;
  for (const [original, isolated] of Object.entries(BIAOFENG_SKILL_OVERRIDES)) {
    targetLib.translate[isolated] = targetLib.translate[original];
    targetLib.translate[isolated + '_info'] = targetLib.translate[original + '_info'];
  }
  targetLib.translate.biaofeng_fanjian_info = '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后随机展示你的一张手牌。若此牌花色与所选花色不同，其先受到你造成的1点伤害；然后，若该角色仍存活，其获得此牌。';
  targetLib.translate.biaofeng_liegong_info = '出牌阶段，你使用【杀】指定目标后，若其手牌数大于或等于你的体力值，或小于或等于你的攻击范围，你可以令其不能使用【闪】响应此【杀】。';
  targetLib.translate.biaofeng_guhuo_info = '你可以将一张手牌扣置并声明为一张基本牌或普通锦囊牌。其他体力大于0的角色可质疑：无人质疑则生效；有人质疑时，若属实，质疑者各失去1点体力，否则各摸一张牌。受到质疑的牌仅在属实且为红桃时生效。';
  installed.add(targetLib);
}

async function resolveBiaofengGuhuo(event, trigger, player) {
	// A question can kill and replace a target before the declared card resolves.
	// Keep this local: the online question must not serialize extra match state.
	const targetNames = new Map((trigger.targets || []).map(target => [target, target.name]));
	event.fake = false;
	event.betrayer = [];
	const [card] = trigger.cards;
	if (card.name != trigger.card.name || (card.name == "sha" && !get.is.sameNature(trigger.card, card))) {
		event.fake = true;
	}
	player.popup(trigger.card.name, "metal");
	const next = player.lose(card, ui.ordering);
	next.relatedEvent = trigger;
	await next;
	trigger.throw = false;
	trigger.skill = "biaofeng_guhuo_backup";
	game.log(player, "声明", trigger.targets && trigger.targets.length ? "对" : "", trigger.targets || "", trigger.name == "useCard" ? "使用" : "打出", trigger.card);
	event.prompt = get.translation(player) + "声明" + (trigger.targets && trigger.targets.length ? "对" + get.translation(trigger.targets) : "") + (trigger.name == "useCard" ? "使用" : "打出") + (get.translation(trigger.card.nature) || "") + get.translation(trigger.card.name) + "，是否质疑？";
	event.targets = game
		.filterPlayer(function (current) {
			return current != player && current.hp > 0;
		})
		.sortBySeat(_status.currentPhase);
	game.broadcastAll(
		function (card, player) {
			_status.biaofeng_guhuoNode = card.copy("thrown");
			if (lib.config.cardback_style != "default") {
				_status.biaofeng_guhuoNode.style.transitionProperty = "none";
				ui.refresh(_status.biaofeng_guhuoNode);
				_status.biaofeng_guhuoNode.classList.add("infohidden");
				ui.refresh(_status.biaofeng_guhuoNode);
				_status.biaofeng_guhuoNode.style.transitionProperty = "";
			} else {
				_status.biaofeng_guhuoNode.classList.add("infohidden");
			}
			_status.biaofeng_guhuoNode.style.transform = "perspective(600px) rotateY(180deg) translateX(0)";
			player.$throwordered2(_status.biaofeng_guhuoNode);
		},
		trigger.cards[0],
		player
	);
	event.onEnd01 = function () {
		_status.biaofeng_guhuoNode.removeEventListener("webkitTransitionEnd", _status.event.onEnd01);
		setTimeout(function () {
			_status.biaofeng_guhuoNode.style.transition = "all ease-in 0.3s";
			_status.biaofeng_guhuoNode.style.transform = "perspective(600px) rotateY(270deg)";
			const onEnd = function () {
				_status.biaofeng_guhuoNode.classList.remove("infohidden");
				_status.biaofeng_guhuoNode.style.transition = "all 0s";
				ui.refresh(_status.biaofeng_guhuoNode);
				_status.biaofeng_guhuoNode.style.transform = "perspective(600px) rotateY(-90deg)";
				ui.refresh(_status.biaofeng_guhuoNode);
				_status.biaofeng_guhuoNode.style.transition = "";
				ui.refresh(_status.biaofeng_guhuoNode);
				_status.biaofeng_guhuoNode.style.transform = "";
				_status.biaofeng_guhuoNode.removeEventListener("webkitTransitionEnd", onEnd);
			};
			_status.biaofeng_guhuoNode.listenTransition(onEnd);
		}, 300);
	};
	for (const target of event.targets) {
		const { links } = await target
			.chooseButton([event.prompt, [["reguhuo_ally", "reguhuo_betray"], "vcard"]], true)
			.set("ai", function (button) {
				const player = _status.event.player;
				const evt = _status.event.getParent("biaofeng_guhuo_guess");
				if (!evt || typeof evt.getTrigger !== "function") {
					return Math.random();
				}
				const evtx = evt.getTrigger();
				const card = { name: evtx.card.name, nature: evtx.card.nature, isCard: true };
				const ally = button.link[2] == "reguhuo_ally";
				if (ally && (player.hp <= 1 || get.attitude(player, evt.player) >= 0)) {
					return 1.1;
				}
				if (!ally && get.attitude(player, evt.player) < 0 && evtx.name == "useCard") {
					let eff = 0;
					const targetsx = evtx.targets || [];
					for (const target of targetsx) {
						const isMe = target == evt.player;
						eff += get.effect(target, card, evt.player, player) / (isMe ? 1.5 : 1);
					}
					eff /= 1.5 * targetsx.length || 1;
					if (eff > 0) {
						return 0;
					}
					if (eff < -7) {
						return Math.random() + Math.pow(-(eff + 7) / 8, 2);
					}
					return Math.pow((get.value(card, evt.player, "raw") - 4) / (eff == 0 ? 5 : 10), 2);
				}
				return Math.random();
			})
			.forResult();
		if (links[0][2] == "reguhuo_betray") {
			target.addExpose(0.2);
			game.log(target, "#y质疑");
			target.popup("质疑！", "fire");
			event.betrayer.add(target);
		} else {
			game.log(target, "#g不质疑");
			target.popup("不质疑", "wood");
		}
	}
	await game.delayx();
	game.broadcastAll(function (onEnd) {
		_status.event.onEnd01 = onEnd;
		if (_status.biaofeng_guhuoNode) {
			_status.biaofeng_guhuoNode.listenTransition(onEnd, 300);
		}
	}, event.onEnd01);
	await game.delay(2);
	if (!event.betrayer.length) {
		return;
	}
	if (event.fake) {
		event.betrayer.forEach(target => target.popup("质疑正确", "wood"));
		await game.asyncDraw(event.betrayer);
		game.log(player, "声明的", trigger.card, "作废了");
		trigger.cancel();
		trigger.getParent().goto(0);
		trigger.line = false;
		event.clearUI = true;
	} else {
		event.betrayer.forEach(target => target.popup("质疑错误", "fire"));
		for (let target of event.betrayer) {
			await target.loseHp();
		}
		if (get.suit(card) != "heart") {
			game.log(player, "声明的", trigger.card, "作废了");
			trigger.cancel();
			trigger.getParent().goto(0);
			trigger.line = false;
			event.clearUI = true;
		}
	}
	if (Array.isArray(trigger.targets)) {
		const survivors = trigger.targets.filter(target => !targetNames.has(target) ||
			(target.name === targetNames.get(target) && target.isIn()));
		// Remove only the dead incarnation, preserving other targets of mass cards.
		// Do this before useCardToTarget triggers so the new hero cannot respond.
		trigger.targets.splice(0, trigger.targets.length, ...survivors);
	}
	await game.delay(2);
	if (event.clearUI) {
		game.broadcastAll(() => ui.clear());
	}
}
