// SPDX-License-Identifier: GPL-3.0-only
// Data for the optional 标风 1v1 variant. No skill implementations are copied here.
// Audited against libnoname/noname revision 90b58bb9934edb1712fd187a80c8323b7aeabaf3.
// Historical roster/pile references: docs/RULES.md. Runtime has no prototype dependency.

export const BIAOFENG_UPSTREAM_REVISION = '90b58bb9934edb1712fd187a80c8323b7aeabaf3';

function hero(id, name, faction, hp, gender, pack, skills, nativeId = id, sourcePack = pack === 'standard' ? 'standard' : 'old', excludedLordSkills = []) {
  return Object.freeze({
    id, nativeId, name, faction, hp, gender, pack, sourcePack,
    skills: Object.freeze(skills), excludedLordSkills: Object.freeze(excludedLordSkills),
  });
}

// Canonical ids are stable display identities; nativeId points to the actual upstream
// character definition. An installer can use isolated biaofeng_* character ids so the
// original 单挑 character overrides and other modes cannot change this roster's skills.
export const BIAOFENG_HEROES = Object.freeze([
  hero('caocao', '曹操', 'wei', 4, 'male', 'standard', ['jianxiong'], 'caocao', 'standard', ['hujia']),
  hero('simayi', '司马懿', 'wei', 3, 'male', 'standard', ['fankui', 'guicai']),
  hero('xiahoudun', '夏侯惇', 'wei', 4, 'male', 'standard', ['ganglie']),
  hero('zhangliao', '张辽', 'wei', 4, 'male', 'standard', ['tuxi']),
  hero('xuchu', '许褚', 'wei', 4, 'male', 'standard', ['luoyi'], 'xuzhu'),
  hero('guojia', '郭嘉', 'wei', 3, 'male', 'standard', ['tiandu', 'yiji']),
  hero('zhenji', '甄姬', 'wei', 3, 'female', 'standard', ['luoshen', 'qingguo']),
  hero('liubei', '刘备', 'shu', 4, 'male', 'standard', ['rende'], 'liubei', 'standard', ['jijiang']),
  hero('guanyu', '关羽', 'shu', 4, 'male', 'standard', ['wusheng']),
  hero('zhangfei', '张飞', 'shu', 4, 'male', 'standard', ['paoxiao']),
  hero('zhugeliang', '诸葛亮', 'shu', 3, 'male', 'standard', ['guanxing', 'kongcheng']),
  hero('zhaoyun', '赵云', 'shu', 4, 'male', 'standard', ['longdan']),
  hero('machao', '马超', 'shu', 4, 'male', 'standard', ['mashu', 'tieji']),
  hero('huangyueying', '黄月英', 'shu', 3, 'female', 'standard', ['jizhi', 'qicai']),
  hero('sunquan', '孙权', 'wu', 4, 'male', 'standard', ['zhiheng'], 'sunquan', 'standard', ['jiuyuan']),
  hero('ganning', '甘宁', 'wu', 4, 'male', 'standard', ['qixi']),
  hero('lvmeng', '吕蒙', 'wu', 4, 'male', 'standard', ['keji']),
  hero('huanggai', '黄盖', 'wu', 4, 'male', 'standard', ['kurou']),
  hero('zhouyu', '周瑜', 'wu', 3, 'male', 'standard', ['yingzi', 'fanjian']),
  hero('daqiao', '大乔', 'wu', 3, 'female', 'standard', ['guose', 'liuli']),
  hero('luxun', '陆逊', 'wu', 3, 'male', 'standard', ['qianxun', 'lianying']),
  hero('sunshangxiang', '孙尚香', 'wu', 3, 'female', 'standard', ['xiaoji', 'jieyin']),
  hero('huatuo', '华佗', 'qun', 3, 'male', 'standard', ['qingnang', 'jijiu']),
  hero('lvbu', '吕布', 'qun', 4, 'male', 'standard', ['wushuang']),
  hero('diaochan', '貂蝉', 'qun', 3, 'female', 'standard', ['lijian', 'biyue']),
  hero('xiahouyuan', '夏侯渊', 'wei', 4, 'male', 'wind', ['shensu']),
  hero('caoren', '曹仁', 'wei', 4, 'male', 'wind', ['jushou'], 'old_caoren', 'shenhua'),
  hero('huangzhong', '黄忠', 'shu', 4, 'male', 'wind', ['liegong']),
  hero('weiyan', '魏延', 'shu', 4, 'male', 'wind', ['kuanggu']),
  hero('xiaoqiao', '小乔', 'wu', 3, 'female', 'wind', ['tianxiang', 'hongyan'], 'old_xiaoqiao'),
  hero('zhoutai', '周泰', 'wu', 4, 'male', 'wind', ['gzbuqu'], 'old_zhoutai', 'shenhua'),
  hero('zhangjiao', '张角', 'qun', 3, 'male', 'wind', ['leiji', 'guidao'], 'zhangjiao', 'old', ['huangtian']),
  hero('yuji', '于吉', 'qun', 3, 'male', 'wind', ['old_guhuo']),
]);

export const BIAOFENG_BANS = Object.freeze(['sunquan', 'caocao', 'lvmeng', 'huatuo']);
// Most wind skills live in shenhua even when their character definition lives in old.
export const BIAOFENG_REQUIRED_CHARACTER_PACKS = Object.freeze(['standard', 'shenhua', 'old']);
export const BIAOFENG_REQUIRED_CARD_PACKS = Object.freeze(['standard']);

/** Returns independent records; never mutates the catalog or an upstream character. */
export function getBiaofengRoster({ fourBans = true } = {}) {
  return BIAOFENG_HEROES
    .filter(character => !fourBans || !BIAOFENG_BANS.includes(character.id))
    .map(character => ({ ...character, skills: [...character.skills], excludedLordSkills: [...character.excludedLordSkills] }));
}

// Two standard cards at every rank of every suit, plus four EX cards. Identical
// tuples intentionally represent distinct physical cards. The native engine creates
// their instance ids. Native spellings are zhuge, dawan and zixin, not prototype ids.
const standardBySuit = {
  spade: [
    ['shandian', 'juedou'], ['bagua', 'cixiong'], ['guohe', 'shunshou'], ['guohe', 'shunshou'],
    ['qinglong', 'jueying'], ['lebu', 'qinggang'], ['sha', 'nanman'], ['sha', 'sha'],
    ['sha', 'sha'], ['sha', 'sha'], ['wuxie', 'shunshou'], ['zhangba', 'guohe'], ['nanman', 'dawan'],
  ],
  heart: [
    ['taoyuan', 'wanjian'], ['shan', 'shan'], ['wugu', 'tao'], ['wugu', 'tao'],
    ['qilin', 'chitu'], ['tao', 'lebu'], ['wuzhong', 'tao'], ['wuzhong', 'tao'],
    ['tao', 'wuzhong'], ['sha', 'sha'], ['sha', 'wuzhong'], ['guohe', 'tao'], ['zhuahuang', 'shan'],
  ],
  club: [
    ['juedou', 'zhuge'], ['sha', 'bagua'], ['sha', 'guohe'], ['sha', 'guohe'],
    ['sha', 'dilu'], ['sha', 'lebu'], ['sha', 'nanman'], ['sha', 'sha'],
    ['sha', 'sha'], ['sha', 'sha'], ['sha', 'sha'], ['jiedao', 'wuxie'], ['jiedao', 'wuxie'],
  ],
  diamond: [
    ['juedou', 'zhuge'], ['shan', 'shan'], ['shan', 'shunshou'], ['shan', 'shunshou'],
    ['shan', 'guanshi'], ['shan', 'sha'], ['shan', 'sha'], ['sha', 'shan'],
    ['sha', 'shan'], ['sha', 'shan'], ['shan', 'shan'], ['tao', 'fangtian'], ['sha', 'zixin'],
  ],
};

export const BIAOFENG_PILE = Object.freeze([
  ...Object.entries(standardBySuit).flatMap(([suit, ranks]) => ranks.flatMap((names, index) => names.map(name => [suit, index + 1, name]))),
  ['spade', 2, 'hanbing'], ['club', 2, 'renwang'], ['heart', 12, 'shandian'], ['diamond', 12, 'wuxie'],
].map(card => Object.freeze(card)));

/** Use this when supplying lib.card.list, which the native engine may shuffle/edit. */
export function createBiaofengPile() {
  return BIAOFENG_PILE.map(card => [...card]);
}

// These are upstream-version differences, not replacements supplied by this module.
// The variant installer owns any narrow correction; standard mode stays untouched.
export const BIAOFENG_NATIVE_DIFFERENCES = Object.freeze([
  Object.freeze({
    hero: 'zhouyu', skill: 'fanjian', source: 'character/standard/skill.js',
    detail: '原生反间先获得牌再结算伤害；约定的旧版先结算伤害再获得牌。标风模式需要单独修正顺序。',
  }),
  Object.freeze({
    hero: 'huangzhong', skill: 'liegong', source: 'character/shenhua/skill.js',
    detail: '原生烈弓未限定出牌阶段；约定的旧版仅在出牌阶段使用杀时发动。',
  }),
  Object.freeze({
    hero: 'yuji', skill: 'old_guhuo', source: 'character/old/skill.js',
    detail: '原生旧蛊惑用原始体力不等于0筛选质疑者，负体力旧不屈角色仍可质疑；约定以最低0体力计算。',
  }),
]);
