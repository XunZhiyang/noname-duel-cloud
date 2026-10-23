import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { removeLicensePrompt, customizeDistribution } from '../scripts/customize.mjs';

// Verbatim compiled startup section from upstream revision 90b58bb9934edb1712fd187a80c8323b7aeabaf3.
const prompt = `    if (!localStorage.getItem("gplv3_noname_alerted")) {
      if (confirm(\`①无名杀是一款基于GPLv3协议的开源软件
你可以在遵守GPLv3协议的基础上任意使用，修改并转发《无名杀》，以及所有基于《无名杀》开发的扩展
点击“确定”即代表您认可并接受GPLv3协议↓️
https://www.gnu.org/licenses/gpl-3.0.html
②无名杀官方发布地址仅有GitHub仓库
其他所有的所谓“无名杀”社群（包括但不限于绝大多数“官方”QQ群、QQ频道等）均为玩家自发组织，与无名杀官方无关\`)) {
        localStorage.setItem("gplv3_noname_alerted", String(true));
      } else {
        game.exit();
        return;
      }
    }
`;
const prefix = `(async () => {
  try {
    await preload({ lib, game, get, _status, ui, ai });
    lib.buildInfo = await loadBuildInfo((url) => lib.init.promises.json(url));
`;
const suffix = `    await boot();
  } catch (e) {
    console.error(e);
    alert("Original startup error: " + e.message);
  }
  confirm("Trust this server?");
})();
`;
const fixture = prefix + prompt + suffix;

function assertOnlyPromptChanged(source, result) {
  const start = source.indexOf(prompt);
  assert.notEqual(start, -1, 'the real pinned prompt must be present');
  const before = source.slice(0, start);
  const after = source.slice(start + prompt.length);
  assert.ok(result.startsWith(before));
  assert.ok(result.endsWith(after));
  assert.match(result.slice(before.length, result.length - after.length), /^    \/\/ Modified by noname-duel-cloud \(\d{4}-\d{2}-\d{2}\):[^\n]+\n$/);
  assert.doesNotMatch(result, /gplv3_noname_alerted/);
}

test('removes only the pinned GPL dialog and is idempotent', () => {
  const result = removeLicensePrompt(fixture);
  assertOnlyPromptChanged(fixture, result);
  assert.equal(removeLicensePrompt(result), result);
  assert.match(result, /confirm\("Trust this server\?"\)/);
});

test('preserves preload, build metadata, boot, errors, and unrelated confirmation behavior', async () => {
  for (const failBoot of [false, true]) {
    const events = [];
    const context = {
      lib: { init: { promises: { json: async url => { events.push(url); return { commit: 'pinned' }; } } } },
      game: { exit: () => assert.fail('Removed GPL branch must not exit the game') },
      get: {}, _status: {}, ui: {}, ai: {},
      preload: async () => events.push('preload'),
      loadBuildInfo: async load => { events.push('metadata'); return load('build-info.json'); },
      boot: async () => { events.push('boot'); if (failBoot) throw new Error('boot failed'); },
      confirm: message => { events.push(message); return false; },
      alert: message => events.push(message),
      console: { error: error => events.push(error.message) },
      localStorage: new Proxy({}, { get: () => assert.fail('Removing the prompt must not write fake license acceptance') }),
    };
    await vm.runInNewContext(removeLicensePrompt(fixture), context);
    assert.deepEqual(events, [
      'preload', 'metadata', 'build-info.json', 'boot',
      ...(failBoot ? ['boot failed', 'Original startup error: boot failed'] : []),
      'Trust this server?',
    ]);
    assert.deepEqual(context.lib.buildInfo, { commit: 'pinned' });
  }
});

test('rejects unknown, duplicated, or partially customized entry shapes', () => {
  for (const source of [
    fixture.replace('GPLv3协议的开源软件', 'a changed license prompt'),
    fixture.replace('await boot();', 'await differentBoot();'),
    fixture.replace(prompt, ''),
    fixture + fixture,
    removeLicensePrompt(fixture).replace('await boot();', 'await differentBoot();'),
    removeLicensePrompt(fixture) + prompt,
  ]) {
    assert.throws(() => removeLicensePrompt(source), /prompt|customized noname entry/);
  }
});

test('customizes only entry.js and does not write on a rejected build', async t => {
  const dist = await mkdtemp(path.join(tmpdir(), 'noname-customize-test-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await mkdir(path.join(dist, 'noname', 'library', 'help'), { recursive: true });
  const entryPath = path.join(dist, 'noname', 'entry.js');
  const untouched = {
    LICENSE: 'Original GPL license text',
    'README.md': 'Original upstream README',
    'noname/library/help/about-game.js': 'Original in-game credits',
    'noname/security.js': 'confirm("Trust this server?");',
  };
  for (const [file, source] of Object.entries(untouched)) await writeFile(path.join(dist, file), source);
  await writeFile(entryPath, fixture);
  await customizeDistribution(dist);
  const first = await readFile(entryPath, 'utf8');
  assertOnlyPromptChanged(fixture, first);
  await customizeDistribution(dist);
  assert.equal(await readFile(entryPath, 'utf8'), first);
  for (const [file, source] of Object.entries(untouched)) assert.equal(await readFile(path.join(dist, file), 'utf8'), source);

  const changed = fixture.replace('await boot();', 'await changedBoot();');
  await writeFile(entryPath, changed);
  await assert.rejects(customizeDistribution(dist), /startup GPL prompt changed/);
  assert.equal(await readFile(entryPath, 'utf8'), changed);
});

test('the real pinned compiled entry retains every byte outside the GPL prompt', async t => {
  const entryPath = new URL('../noname/apps/core/dist/noname/entry.js', import.meta.url);
  let source;
  try { source = await readFile(entryPath, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Run npm run setup to build the pinned upstream distribution.');
    return;
  }
  assert.match(source, /await preload\(\{ lib, game, get, _status, ui, ai \}\);/);
  assert.match(source, /alert\(`《无名杀》加载内容失败/);
  assertOnlyPromptChanged(source, removeLicensePrompt(source));
});
