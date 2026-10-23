import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { addQuickDuelBoot, installQuickDuelDistribution } from '../scripts/install-quick-duel.mjs';

test('quick preferences apply after saved config and before device prompts, with normal boot unchanged', async () => {
  const source = '(async () => {\n  await loadConfig();\n  continueBoot();\n})();';
  const patched = addQuickDuelBoot(source);
  assert.equal(addQuickDuelBoot(patched), patched);
  for (const quick of [false, true]) {
    const order = [];
    const lib = quick ? { quickDuel: { prepare: () => order.push('quick') } } : {};
    await vm.runInNewContext(patched, { lib, loadConfig: async () => order.push('config'), continueBoot: () => order.push('boot') });
    assert.deepEqual(order, quick ? ['config', 'quick', 'boot'] : ['config', 'boot']);
  }
  for (const changed of [source + source, source.replace('loadConfig', 'loadSettings'), patched.replace('prepare()', 'different()')]) {
    assert.throws(() => addQuickDuelBoot(changed), /changed|Unexpected/);
  }
});

test('quick distribution includes its UI resources and patches the pinned real boot only once', async t => {
  let original;
  try { original = await readFile(new URL('../noname/apps/core/dist/noname/init/index.js', import.meta.url), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; t.skip('Run npm run setup first.'); return; }
  const dist = await mkdtemp(path.join(tmpdir(), 'noname-quick-build-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await mkdir(path.join(dist, 'noname/init'), { recursive: true });
  await writeFile(path.join(dist, 'noname/init/index.js'), original);
  await installQuickDuelDistribution(dist);
  await installQuickDuelDistribution(dist);
  const patched = await readFile(path.join(dist, 'noname/init/index.js'), 'utf8');
  assert.equal(patched, addQuickDuelBoot(original));
  assert.ok(patched.indexOf('lib.quickDuel?.prepare();') < patched.indexOf('是否切换到触屏模式'));
  for (const name of ['quick-duel.js', 'quick-duel-view.js', 'quick-duel.css']) {
    const copied = await readFile(path.join(dist, 'additions', name), 'utf8');
    assert.equal(copied, await readFile(new URL(`../additions/${name}`, import.meta.url), 'utf8'));
  }
});
