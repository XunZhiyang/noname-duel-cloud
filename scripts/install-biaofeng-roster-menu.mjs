/** Keep the native character tab aligned with the selected classic duel rules. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const imports = 'import { attachBiaofengRosterMenu, refreshBiaofengRosterMenus } from "../../../../../additions/biaofeng-roster-menu.js";\nimport { menuUpdates as biaofengMenuUpdates } from "../index.js";\n';
const updateAnchor = '  setUpdateActive(function(node) {\n';
const updateHook = '    refreshBiaofengRosterMenus(lib);\n';
const attachAnchor = '  updateNodes();\n  return function(packName) {\n';
const attachHook = '  // Modified by noname-duel-cloud (2026-10-23): display the fixed classic roster.\n  biaofengMenuUpdates.push(attachBiaofengRosterMenu(lib, start, cacheMenux.pages[0], connectMenu));\n';

export function addBiaofengRosterMenu(source) {
  if (source.startsWith(imports) && source.includes(updateAnchor + updateHook) && source.includes(attachHook)) return source;
  if (source.includes('attachBiaofengRosterMenu') || source.split(updateAnchor).length !== 2 || source.split(attachAnchor).length !== 2) {
    throw new Error('Pinned character menu changed. Review the classic roster integration.');
  }
  return imports + source.replace(updateAnchor, updateAnchor + updateHook).replace(attachAnchor, `  updateNodes();\n${attachHook}  return function(packName) {\n`);
}

export async function installBiaofengRosterMenuDistribution(dist) {
  const target = path.join(dist, 'noname/ui/create/menu/pages/characterPackMenu.js');
  await writeFile(target, addBiaofengRosterMenu(await readFile(target, 'utf8')));
}
