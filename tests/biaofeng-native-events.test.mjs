import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual pinned GameEvent, manager and array compiler. Only their
// surrounding game/DOM services are stubbed: finish(), next's Proxy, await,
// waitNext(), private inContent state and compiler step advancement are native.
async function nativeEvents(t) {
  const root = new URL('../noname/apps/core/dist/noname/library/element/', import.meta.url);
  const files = ['gameEvent.js', 'GameEvent/GameEventManager.js', 'GameEvent/compilers/ContentCompilerBase.js', 'GameEvent/compilers/ArrayCompiler.js'];
  let sources;
  try { sources = await Promise.all(files.map(file => readFile(new URL(file, root), 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Run npm run setup to build the pinned native event classes.'); return;
  }
  const status = { pauseManager: { waitPause: async () => {} }, connectMode: false };
  const history = [];
  const context = vm.createContext({
    console, _status: status, ui: {}, get: {},
    lib: { config: { ignore_error: false }, phaseName: [], announce: { publish() {} } },
    game: { online: false, globalEventHandlers: { addHandlerToEvent() {} }, getGlobalHistory: () => history },
  });
  vm.runInContext('Array.prototype.add = function (item) { if (!this.includes(item)) this.push(item); return this; };', context);
  const stripModule = source => source.replace(/^import .*;\n/gm, '').replace(/\nexport \{[\s\S]*?\};\s*$/, '');
  for (const source of sources) vm.runInContext(stripModule(source), context);
  const { GameEvent, GameEventManager, ArrayCompiler } = vm.runInContext('({GameEvent,GameEventManager,ArrayCompiler})', context);
  status.eventManager = new GameEventManager();
  Object.defineProperty(status, 'event', { get: () => status.eventManager.getStatusEvent() });
  const variant = (await readFile(new URL('../additions/biaofeng-single.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '')
    .replace(/\bexport default function /g, 'function ')
    .replace(/\bexport (const|function) /g, '$1 ');
  vm.runInContext(variant, context);
  const finishOldHeroEvents = vm.runInContext('finishOldHeroEvents', context);
  const compiler = new ArrayCompiler();
  const player = id => ({ id, skipList: [], isDead: () => false, isOut: () => false });
  function event(name, owner, steps, parent) {
    const next = new GameEvent(name, false);
    if (owner) next.player = owner;
    next.content = compiler.compile(steps);
    parent?.next.push(next);
    return next;
  }
  return { event, player, finishOldHeroEvents };
}

test('native finish skips later-created children, but does not cancel already queued Kurou draws', async t => {
  const native = await nativeEvents(t);
  if (!native) return;
  const { event } = native;
  const before = [];
  const queued = event('kurou', null, [async current => {
    event('loseHp', null, [async () => { before.push('loseHp'); current.finish(); }], current);
    event('draw', null, [async () => { before.push('draw2'); }], current);
  }]);
  await queued.start();
  assert.deepEqual(before, ['loseHp', 'draw2']);

  const after = [];
  const awaited = event('kurou', null, [async current => {
    await event('loseHp', null, [async () => { after.push('loseHp'); current.finish(); }], current);
    await event('draw', null, [async () => { after.push('draw2'); }], current);
  }]);
  await awaited.start();
  assert.deepEqual(after, ['loseHp']);
});

test('replacement cancels fatal Kurou queued draw and the old own turn, while its new hero draws exactly4', async t => {
  const native = await nativeEvents(t);
  if (!native) return;
  const { event, player, finishOldHeroEvents } = native;
  const victim = player('victim');
  const log = [];
  let phase;
  const replacement = parent => event('replacePlayerBiaofeng', victim, [async current => {
    finishOldHeroEvents(current, victim);
    await event('draw', victim, [async () => { log.push('successor-draw4'); }], current);
  }], parent);
  phase = event('phase', victim, [
    async current => {
      event('kurou', victim, [async skill => {
        event('loseHp', victim, [async loss => {
          event('dying', victim, [async dying => {
            // Native dieAfter2 schedules replacement on die.getParent(), so it
            // follows the complete die event as a sibling inside dying.
            event('die', victim, [async die => { replacement(die.parent); }], dying);
          }], loss);
        }], skill);
        event('draw', victim, [async () => { log.push('old-kurou-draw2'); }], skill);
      }], current);
    },
    async () => { log.push('old-turn-continues'); },
  ]);
  await phase.start();
  assert.deepEqual(log, ['successor-draw4']);
});

test('opponent lethal damage preserves its damage-source step and card/turn continuation', async t => {
  const native = await nativeEvents(t);
  if (!native) return;
  const { event, player, finishOldHeroEvents } = native;
  const victim = player('victim'), attacker = player('attacker');
  const log = [];
  let damage;
  const phase = event('phase', attacker, [
    async current => {
      event('useCard', attacker, [
        async card => {
          damage = event('damage', victim, [
            async hit => {
              event('dying', victim, [async dying => {
                event('die', victim, [async die => {
                  event('replacePlayerBiaofeng', victim, [async replacement => {
                    finishOldHeroEvents(replacement, victim);
                    await event('draw', victim, [async () => { log.push('successor-draw4'); }], replacement);
                  }], die.parent);
                }], dying);
              }], hit);
            },
            // This is the placement used by native content.damage: damageSource
            // occurs after the dying child, and is required by 魏延's 狂骨.
            async () => { log.push('surviving-source-damageSource'); },
          ], card);
        },
        async () => { log.push('opponent-card-continues'); },
      ], current);
    },
    async () => { log.push('opponent-turn-continues'); },
  ]);
  await phase.start();
  assert.ok(damage._notrigger.includes(victim), 'the successor must not receive old victim damage triggers');
  assert.deepEqual(log, ['successor-draw4', 'surviving-source-damageSource', 'opponent-card-continues', 'opponent-turn-continues']);
});
