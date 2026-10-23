import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import registerBiaofengMenu from '../additions/biaofeng-menu.js';
import { addBiaofengToSingle, installBiaofengDistribution } from '../scripts/install-biaofeng.mjs';

async function originalMenu(t) {
  let source;
  try { source = await readFile(new URL('../noname/apps/core/dist/noname/library/index.js', import.meta.url), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Run npm run setup first to test the pinned original menu.');
    return;
  }
  const start = source.indexOf('    single: {\n      name: "单挑",');
  const end = source.indexOf('    chess: {', start);
  assert.ok(start > 0 && end > start, 'Pinned menu shape changed');
  return vm.runInNewContext(`({${source.slice(start, end)}}).single`);
}

test('registers the extra online/local mode while preserving original choices and updates', async t => {
  const single = await originalMenu(t);
  if (!single) return;
  const lib = { mode: { single }, translate: {} };
  const get = { modetrans: config => `original:${config.single_mode}` };
  const originals = {};
  for (const [name, prefix] of [['config', ''], ['connect', 'connect_']]) {
    const section = single[name];
    originals[name] = { ...section[`${prefix}single_mode`].item };
  }
  registerBiaofengMenu(lib, get);
  registerBiaofengMenu(lib, get);
  assert.equal(get.modetrans({ mode: 'single', single_mode: 'biaofeng' }), '标风 1v1');
  assert.equal(get.modetrans({ mode: 'single', single_mode: 'normal' }), 'original:normal');
  for (const [name, prefix] of [['config', ''], ['connect', 'connect_']]) {
    const section = single[name];
    assert.deepEqual({ ...section[`${prefix}single_mode`].item }, { ...originals[name], biaofeng: '标风 1v1' });
    assert.equal(section[`${prefix}single_mode`].init, 'normal');
    assert.equal(section[`${prefix}biaofeng_four_bans`].init, true);
    for (const mode of ['normal', 'dianjiang', 'changban', 'wuxianhuoli', 'biaofeng']) {
      const visible = {};
      const map = Object.fromEntries(Object.keys(section).map(key => [key, {
        show() { visible[key] = true; }, hide() { visible[key] = false; },
      }]));
      section.update({ [`${prefix}single_mode`]: mode, [`${prefix}double_character`]: 'single' }, map);
      assert.equal(visible[`${prefix}biaofeng_four_bans`], mode === 'biaofeng');
      assert.equal(visible[`${prefix}enable_jin`], mode === 'normal');
      assert.equal(visible[`${prefix}change_card`], mode === 'wuxianhuoli');
      assert.equal(visible[`${prefix}double_character`], mode === 'dianjiang');
    }
  }
  assert.equal(lib.translate.biaofeng2, '标风 1v1');
});

test('adds the installer to the real single bundle without rewriting native modes', async t => {
  let source;
  try { source = await readFile(new URL('../noname/apps/core/dist/mode/single.js', import.meta.url), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Run npm run setup first to test the original single bundle.');
    return;
  }
  const patched = addBiaofengToSingle(source);
  assert.equal(addBiaofengToSingle(patched), patched);
  assert.ok(patched.includes(source.slice(0, source.indexOf('\nexport {'))));
  assert.match(patched, /installBiaofeng\(single\);\nexport/);
  assert.throws(() => addBiaofengToSingle(source.replace('single as default', 'other as default')), /export changed/);
  assert.throws(() => addBiaofengToSingle(source + source), /export changed/);
});

test('the deployment preload registers the room menu before boot and keeps the same-origin lobby', async () => {
  const source = await readFile(new URL('../scripts/preload.js', import.meta.url), 'utf8');
  const calls = [];
  const context = { lib: {} };
  const run = vm.runInNewContext(source.replace(/^import .+;\n/gm, '').replace('export default async function preload', 'async function preload') + '\npreload', {
    browserReady: async value => { assert.equal(value, context); calls.push('browser'); },
    registerBiaofengMenu: value => { assert.equal(value, context.lib); calls.push('menu'); },
    location: { protocol: 'https:', host: 'example.onrender.com' },
  });
  await run(context);
  assert.deepEqual(calls, ['browser', 'menu']);
  assert.equal(context.lib.hallURL, 'wss://example.onrender.com');
});

test('distribution installation includes all referenced variant modules and leaves original attribution intact', async t => {
  const dist = await mkdtemp(path.join(tmpdir(), 'noname-biaofeng-build-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await mkdir(path.join(dist, 'mode'));
  const source = 'const single = {};\nconst type = "mode";\nexport {\n  single as default,\n  type\n};\n';
  await writeFile(path.join(dist, 'mode/single.js'), source);
  await writeFile(path.join(dist, 'LICENSE'), 'Original license retained');
  await installBiaofengDistribution(dist);
  await installBiaofengDistribution(dist);
  assert.equal(await readFile(path.join(dist, 'mode/single.js'), 'utf8'), addBiaofengToSingle(source));
  for (const name of ['biaofeng-menu.js', 'biaofeng-data.js', 'biaofeng-single.js', 'biaofeng-skills.js']) {
    const copied = await readFile(path.join(dist, 'additions', name), 'utf8');
    assert.equal(copied, await readFile(new URL(`../additions/${name}`, import.meta.url), 'utf8'));
    for (const match of copied.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      await readFile(path.resolve(dist, 'additions', match[1]), 'utf8');
    }
  }
  assert.equal(await readFile(path.join(dist, 'LICENSE'), 'utf8'), 'Original license retained');
});
