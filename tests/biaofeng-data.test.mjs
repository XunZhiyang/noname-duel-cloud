import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BIAOFENG_HEROES, BIAOFENG_BANS, BIAOFENG_PILE,
  BIAOFENG_REQUIRED_CHARACTER_PACKS, BIAOFENG_REQUIRED_CARD_PACKS,
  getBiaofengRoster, createBiaofengPile,
} from '../additions/biaofeng-data.js';

const counts = values => values.reduce((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), {});
const sorted = values => [...values].sort();

// Independent card-first inventory: do not regenerate these expectations from the
// production suit-first table. This catches wrong ranks as well as wrong totals.
const physicalCards = {
  sha: { spade: [7, 8, 8, 9, 9, 10, 10], heart: [10, 10, 11], club: [2, 3, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11], diamond: [6, 7, 8, 9, 10, 13] },
  shan: { heart: [2, 2, 13], diamond: [2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11] },
  tao: { heart: [3, 4, 6, 7, 8, 9, 12], diamond: [12] },
  juedou: { spade: [1], club: [1], diamond: [1] },
  guohe: { spade: [3, 4, 12], heart: [12], club: [3, 4] },
  shunshou: { spade: [3, 4, 11], diamond: [3, 4] },
  wuzhong: { heart: [7, 8, 9, 11] },
  wuxie: { spade: [11], club: [12, 13], diamond: [12] },
  jiedao: { club: [12, 13] }, taoyuan: { heart: [1] }, wugu: { heart: [3, 4] },
  nanman: { spade: [7, 13], club: [7] }, wanjian: { heart: [1] },
  lebu: { spade: [6], heart: [6], club: [6] }, shandian: { spade: [1], heart: [12] },
  zhuge: { club: [1], diamond: [1] }, cixiong: { spade: [2] }, qinggang: { spade: [6] },
  qinglong: { spade: [5] }, zhangba: { spade: [12] }, guanshi: { diamond: [5] },
  fangtian: { diamond: [12] }, qilin: { heart: [5] }, hanbing: { spade: [2] },
  bagua: { spade: [2], club: [2] }, renwang: { club: [2] }, dilu: { club: [5] },
  jueying: { spade: [5] }, zhuahuang: { heart: [13] }, chitu: { heart: [5] },
  dawan: { spade: [13] }, zixin: { diamond: [13] },
};

test('标风 pile is exactly the historical standard104 + EX4 inventory in native names', () => {
  const pile = createBiaofengPile();
  assert.equal(pile.length, 108);
  assert.equal(new Set(pile).size, 108, 'duplicate suit/rank/name tuples remain separate physical entries');
  assert.deepEqual(counts(pile.map(([suit]) => suit)), { spade: 27, heart: 27, club: 27, diamond: 27 });
  assert.deepEqual(sorted(new Set(pile.map(([, , name]) => name))), sorted(Object.keys(physicalCards)));
  for (const [name, bySuit] of Object.entries(physicalCards)) {
    const expected = Object.entries(bySuit).flatMap(([suit, ranks]) => ranks.map(rank => `${suit}:${rank}`));
    const actual = pile.filter(([, , cardName]) => cardName === name).map(([suit, rank]) => `${suit}:${rank}`);
    assert.deepEqual(sorted(actual), sorted(expected), name);
  }
  assert.deepEqual(pile.slice(-4), [['spade', 2, 'hanbing'], ['club', 2, 'renwang'], ['heart', 12, 'shandian'], ['diamond', 12, 'wuxie']]);
  const totals = counts(pile.map(([, , name]) => name));
  assert.deepEqual([totals.sha, totals.shan, totals.tao], [30, 15, 8]);
  const trickNames = ['juedou', 'guohe', 'shunshou', 'wuzhong', 'wuxie', 'jiedao', 'taoyuan', 'wugu', 'nanman', 'wanjian'];
  const tricks = trickNames.reduce((sum, name) => sum + totals[name], 0);
  const delays = totals.lebu + totals.shandian;
  assert.deepEqual([tricks, delays, pile.length - 53 - tricks - delays], [31, 5, 19]);
  for (const tuple of pile) {
    assert.equal(tuple.length, 3, 'no elemental Sha or extra expansion properties');
    assert.ok(Number.isInteger(tuple[1]) && tuple[1] >= 1 && tuple[1] <= 13);
  }
});

const expectedSkills = {
  caocao: ['jianxiong'], simayi: ['fankui', 'guicai'], xiahoudun: ['ganglie'], zhangliao: ['tuxi'], xuchu: ['luoyi'], guojia: ['tiandu', 'yiji'], zhenji: ['luoshen', 'qingguo'],
  liubei: ['rende'], guanyu: ['wusheng'], zhangfei: ['paoxiao'], zhugeliang: ['guanxing', 'kongcheng'], zhaoyun: ['longdan'], machao: ['mashu', 'tieji'], huangyueying: ['jizhi', 'qicai'],
  sunquan: ['zhiheng'], ganning: ['qixi'], lvmeng: ['keji'], huanggai: ['kurou'], zhouyu: ['yingzi', 'fanjian'], daqiao: ['guose', 'liuli'], luxun: ['qianxun', 'lianying'], sunshangxiang: ['xiaoji', 'jieyin'],
  huatuo: ['qingnang', 'jijiu'], lvbu: ['wushuang'], diaochan: ['lijian', 'biyue'],
  xiahouyuan: ['shensu'], caoren: ['jushou'], huangzhong: ['liegong'], weiyan: ['kuanggu'], xiaoqiao: ['tianxiang', 'hongyan'], zhoutai: ['gzbuqu'], zhangjiao: ['leiji', 'guidao'], yuji: ['old_guhuo'],
};

test('标风 roster contains precisely standard25 + original wind8 with printed HP and no lord skills', () => {
  assert.equal(BIAOFENG_HEROES.length, 33);
  for (const field of ['id', 'nativeId', 'name']) assert.equal(new Set(BIAOFENG_HEROES.map(hero => hero[field])).size, 33, field);
  assert.deepEqual(sorted(BIAOFENG_HEROES.map(hero => hero.id)), sorted(Object.keys(expectedSkills)));
  assert.deepEqual(counts(BIAOFENG_HEROES.map(hero => hero.pack)), { standard: 25, wind: 8 });
  assert.deepEqual(counts(BIAOFENG_HEROES.map(hero => hero.faction)), { wei: 9, shu: 9, wu: 10, qun: 5 });
  const threeHp = ['simayi', 'guojia', 'zhenji', 'zhugeliang', 'huangyueying', 'zhouyu', 'daqiao', 'luxun', 'sunshangxiang', 'huatuo', 'diaochan', 'xiaoqiao', 'zhangjiao', 'yuji'];
  const female = ['zhenji', 'huangyueying', 'daqiao', 'sunshangxiang', 'diaochan', 'xiaoqiao'];
  for (const hero of BIAOFENG_HEROES) {
    assert.deepEqual(hero.skills, expectedSkills[hero.id], hero.id);
    assert.equal(hero.hp, threeHp.includes(hero.id) ? 3 : 4, hero.id);
    assert.equal(hero.gender, female.includes(hero.id) ? 'female' : 'male', hero.id);
    assert.doesNotMatch(hero.name, /旧|界|神|新/, 'show the original name without an upstream version prefix');
    assert.ok(!hero.skills.some(skill => ['hujia', 'jijiang', 'jiuyuan', 'huangtian'].includes(skill)));
  }
  assert.deepEqual(sorted(BIAOFENG_HEROES.flatMap(hero => hero.excludedLordSkills)), sorted(['hujia', 'jijiang', 'jiuyuan', 'huangtian']));
});

test('four bans default to on, and disabling them restores the complete33 without modifying upstream data', () => {
  assert.deepEqual(BIAOFENG_BANS, ['sunquan', 'caocao', 'lvmeng', 'huatuo']);
  const defaultRoster = getBiaofengRoster();
  assert.equal(defaultRoster.length, 29);
  assert.ok(defaultRoster.every(hero => !BIAOFENG_BANS.includes(hero.id)));
  assert.deepEqual(getBiaofengRoster({ fourBans: true }), defaultRoster);
  assert.equal(getBiaofengRoster({ fourBans: false }).length, 33);
  defaultRoster[0].skills.push('unwanted');
  defaultRoster[0].name = 'changed';
  assert.ok(!getBiaofengRoster()[0].skills.includes('unwanted'));
  assert.notEqual(getBiaofengRoster()[0].name, 'changed');
  const pile = createBiaofengPile();
  pile[0][1] = 99;
  pile.pop();
  assert.equal(createBiaofengPile()[0][1], 1);
  assert.equal(createBiaofengPile().length, 108);
  assert.ok(Object.isFrozen(BIAOFENG_PILE) && Object.isFrozen(BIAOFENG_PILE[0]));
});

test('native character mapping and every referenced skill exist in the pinned original packs', async t => {
  const root = new URL('../noname/apps/core/', import.meta.url);
  let source;
  try { source = await readFile(new URL('character/standard/character.js', root), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Run npm run setup to obtain the pinned original packs.'); return;
  }
  assert.match(source, /const characters/);
  assert.deepEqual(BIAOFENG_REQUIRED_CHARACTER_PACKS, ['standard', 'shenhua', 'old']);
  assert.deepEqual(BIAOFENG_REQUIRED_CARD_PACKS, ['standard']);
  const packs = {};
  let skillSources = '';
  for (const pack of BIAOFENG_REQUIRED_CHARACTER_PACKS) {
    // These character.js modules contain only data and do not load DOM or the game.
    packs[pack] = (await import(new URL(`character/${pack}/character.js`, root))).default;
    skillSources += await readFile(new URL(`character/${pack}/skill.js`, root), 'utf8');
  }
  for (const hero of BIAOFENG_HEROES) {
    const native = packs[hero.sourcePack][hero.nativeId];
    assert.ok(native, `${hero.nativeId} exists in ${hero.sourcePack}`);
    assert.equal(native.hp, hero.hp, hero.id);
    assert.equal(native.group, hero.faction, hero.id);
    assert.equal(native.sex, hero.gender, hero.id);
    assert.deepEqual(native.skills.filter(skill => !hero.excludedLordSkills.includes(skill)), hero.skills, hero.id);
    for (const skill of hero.skills) assert.match(skillSources, new RegExp(`^\\t${skill}:`, 'm'), `${skill} has a native implementation`);
  }
  const nativeCards = await readFile(new URL('card/standard.js', root), 'utf8');
  const list = nativeCards.match(/\n\tlist: (\[[\s\S]*\]),\n};\s*$/)?.[1];
  assert.ok(list, 'the pinned native standard deck shape remains recognizable');
  const nativePile = JSON.parse(list.replace(/,\s*\]/g, ']'));
  assert.deepEqual(sorted(BIAOFENG_PILE.map(JSON.stringify)), sorted(nativePile.map(JSON.stringify)), 'same exact108 physical cards as upstream standard.list');
});
