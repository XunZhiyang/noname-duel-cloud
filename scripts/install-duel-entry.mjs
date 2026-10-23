import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const anchor = '  lib.quickDuel?.prepare();\n';
const hook = '  // Modified by noname-duel-cloud: explicit local/hall startup.\n  lib.duelEntry?.prepare();\n';
export function addDuelEntryBoot(source) {
  if (source.split(anchor).length !== 2) throw new Error('Pinned config loading changed.');
  if (source.includes('lib.duelEntry')) {
    if (source.split(hook).length === 2 && source.includes(anchor + hook)) return source;
    throw new Error('Unexpected duel entry boot hook.');
  }
  return source.replace(anchor, anchor + hook);
}
export async function installDuelEntryDistribution(dist) {
  const bootPath = path.join(dist, 'noname/init/index.js');
  const source = addDuelEntryBoot(await readFile(bootPath, 'utf8'));
  await mkdir(path.join(dist, 'additions'), { recursive: true });
  for (const name of ['duel-entry.js', 'duel-home.html']) await copyFile(path.join(root, 'additions', name), path.join(dist, 'additions', name));
  await writeFile(bootPath, source);
}
