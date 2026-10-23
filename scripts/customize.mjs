/** Small, auditable distribution customization for the pinned upstream build. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const beforePrompt = '    lib.buildInfo = await loadBuildInfo((url) => lib.init.promises.json(url));\n';
const afterPrompt = '    await boot();\n  } catch (e) {';
const licensePrompt = [
  '    if (!localStorage.getItem("gplv3_noname_alerted")) {',
  '      if (confirm(`①无名杀是一款基于GPLv3协议的开源软件',
  '你可以在遵守GPLv3协议的基础上任意使用，修改并转发《无名杀》，以及所有基于《无名杀》开发的扩展',
  '点击“确定”即代表您认可并接受GPLv3协议↓️',
  'https://www.gnu.org/licenses/gpl-3.0.html',
  '②无名杀官方发布地址仅有GitHub仓库',
  '其他所有的所谓“无名杀”社群（包括但不限于绝大多数“官方”QQ群、QQ频道等）均为玩家自发组织，与无名杀官方无关`)) {',
  '        localStorage.setItem("gplv3_noname_alerted", String(true));',
  '      } else {',
  '        game.exit();',
  '        return;',
  '      }',
  '    }',
  '',
].join('\n');
const attribution = '    // Modified by noname-duel-cloud (2026-10-22): omit the startup GPL confirmation; LICENSE and in-game attribution remain available.\n';
const original = beforePrompt + licensePrompt + afterPrompt;
const customized = beforePrompt + attribution + afterPrompt;
const marker = 'Modified by noname-duel-cloud (2026-10-22): omit the startup GPL confirmation;';

function count(source, value) {
  return source.split(value).length - 1;
}

/** Remove only the known startup prompt, rejecting an unexpected upstream shape. */
export function removeLicensePrompt(source) {
  if (typeof source !== 'string') throw new TypeError('Expected compiled entry source as a string.');

  if (source.includes(marker)) {
    if (count(source, customized) !== 1 || count(source, marker) !== 1 || source.includes('gplv3_noname_alerted')) {
      throw new Error('Unexpected customized noname entry. Review the pinned startup prompt patch before building.');
    }
    return source;
  }

  if (count(source, original) !== 1 || count(source, 'gplv3_noname_alerted') !== 2) {
    throw new Error('Pinned noname startup GPL prompt changed or is missing. Review the distribution customization before building.');
  }
  return source.replace(original, customized);
}

/** Leave all other distribution files, including license and attribution, intact. */
export async function customizeDistribution(dist) {
  const entryPath = path.join(dist, 'noname', 'entry.js');
  const source = await readFile(entryPath, 'utf8');
  const customizedSource = removeLicensePrompt(source);
  if (customizedSource !== source) await writeFile(entryPath, customizedSource);
}
