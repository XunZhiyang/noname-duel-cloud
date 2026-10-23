/** Wire the optional invite-link flow into the pinned boot, after saved preferences load. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const anchor = '  await loadConfig();\n';
const hook = '  // Modified by noname-duel-cloud (2026-10-23): optional quick duel URL settings.\n  lib.quickDuel?.prepare();\n';
const modules = ['quick-duel.js', 'quick-duel-view.js', 'quick-duel.css'];

export function addQuickDuelBoot(source) {
  if (source.split(anchor).length !== 2) throw new Error('Pinned config loading changed. Review the quick duel boot integration.');
  if (source.includes('lib.quickDuel')) {
    if (source.split(hook).length === 2 && source.includes(anchor + hook)) return source;
    throw new Error('Unexpected quick duel boot hook.');
  }
  return source.replace(anchor, anchor + hook);
}

export async function installQuickDuelDistribution(dist) {
  const bootPath = path.join(dist, 'noname/init/index.js');
  const boot = addQuickDuelBoot(await readFile(bootPath, 'utf8'));
  for (const name of modules) await readFile(path.join(root, 'additions', name));
  await mkdir(path.join(dist, 'additions'), { recursive: true });
  for (const name of modules) await copyFile(path.join(root, 'additions', name), path.join(dist, 'additions', name));
  await writeFile(bootPath, boot);
}
