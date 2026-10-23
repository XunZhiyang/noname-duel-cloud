/** Build the pinned upstream game, then apply documented deployment defaults. */
import { spawnSync } from 'node:child_process';
import { access, copyFile, readFile, writeFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { customizeDistribution } from './customize.mjs';
import { installBiaofengDistribution } from './install-biaofeng.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = path.join(root, 'noname');
const revision = '90b58bb9934edb1712fd187a80c8323b7aeabaf3';
const repository = 'https://github.com/libnoname/noname.git';
const env = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1', NODE_ENV: 'production' };

function run(command, args, cwd = upstream, capture = false) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || ''}`);
  return result.stdout?.trim();
}

let existing = false;
try { await access(path.join(upstream, '.git')); existing = true; } catch {}
if (!existing) {
  run('git', ['init', upstream], root);
  run('git', ['remote', 'add', 'origin', repository]);
  run('git', ['fetch', '--depth=1', 'origin', revision]);
  run('git', ['checkout', '--detach', 'FETCH_HEAD']);
}
const actual = run('git', ['rev-parse', 'HEAD'], upstream, true);
if (actual !== revision) throw new Error(`Expected upstream ${revision}, found ${actual}. Keep or move your checkout before preparing this pinned release.`);
const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], upstream, true);
if (dirty) throw new Error('Upstream has local edits. Preserve them before building the pinned release.');

const pnpm = args => run('npx', ['--yes', 'pnpm@11.15.1', ...args]);
pnpm(['install', '--frozen-lockfile', '--prod=false']);
// Upstream's aggregate script does not propagate every child build failure.
// Remove generated outputs so a failed child cannot pass using stale artifacts.
for (const directory of ['dist', 'apps/core/dist', 'packages/fs/dist', 'packages/jit/dist', 'packages/server/dist']) {
  await rm(path.join(upstream, directory), { recursive: true, force: true });
}
pnpm(['build']);
pnpm(['-F', '@noname/server', 'build']);

for (const file of ['dist/index.html', 'dist/noname.js', 'dist/LICENSE', 'dist/README.md', 'packages/fs/dist/index.js', 'packages/server/dist/index.js']) {
  if (!(await stat(path.join(upstream, file))).isFile()) throw new Error(`Missing build output: ${file}`);
}
const imports = await readFile(path.join(upstream, 'dist/noname/init/import.js'), 'utf8');
if (!imports.includes('const path = false ? `/character/${name}/index` : `/character/${name}`;')) {
  throw new Error('Upstream was not built with production character paths.');
}
const buildInfo = JSON.parse(await readFile(path.join(upstream, 'dist/game/build-info.json'), 'utf8'));
if (buildInfo.commit !== revision) throw new Error('Built game does not match the pinned upstream revision.');
await copyFile(path.join(root, 'scripts/preload.js'), path.join(upstream, 'dist/preload.js'));
const configPath = path.join(upstream, 'dist/game/config.json');
const defaults = JSON.parse(await readFile(configPath, 'utf8'));
// User preferences in IndexedDB still override these deployment defaults.
defaults.mode = 'connect';
defaults.show_splash = 'off';
defaults.mode_config ??= {};
defaults.mode_config.connect ??= {};
defaults.mode_config.connect.read_clipboard = false;
await writeFile(configPath, JSON.stringify(defaults));
await customizeDistribution(path.join(upstream, 'dist'));
await installBiaofengDistribution(path.join(upstream, 'dist'));
console.log(`Ready: noname ${revision}. Run npm start.`);
