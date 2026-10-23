/** Add the classic duel variant to a pinned build without editing upstream sources. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importLine = 'import installBiaofeng from "../additions/biaofeng-single.js";\n';
const exportBlock = 'export {\n  single as default,\n  type\n};\n';
const installLine = '// Modified by noname-duel-cloud (2026-10-23): add the optional classic duel.\ninstallBiaofeng(single);\n';

export function addBiaofengToSingle(source) {
  if (source.startsWith(importLine) && source.endsWith(installLine + exportBlock)) return source;
  if (source.includes('installBiaofeng') || source.split(exportBlock).length !== 2 || !source.endsWith(exportBlock)) {
    throw new Error('Pinned single-mode export changed. Review the classic duel integration.');
  }
  return importLine + source.slice(0, -exportBlock.length) + installLine + exportBlock;
}

export async function installBiaofengDistribution(dist) {
  const modePath = path.join(dist, 'mode/single.js');
  // Validate before writing any build files, so a changed upstream fails visibly.
  const source = await readFile(modePath, 'utf8');
  const customized = addBiaofengToSingle(source);
  const modules = ['biaofeng-menu.js', 'biaofeng-data.js', 'biaofeng-single.js', 'biaofeng-skills.js'];
  for (const name of modules) await readFile(path.join(root, 'additions', name), 'utf8');
  await mkdir(path.join(dist, 'additions'), { recursive: true });
  for (const name of modules) await copyFile(path.join(root, 'additions', name), path.join(dist, 'additions', name));
  await writeFile(modePath, customized);
}
