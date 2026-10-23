// Deployment defaults and the additional classic duel menu (GPL-3.0-only).
import browserReady from '/noname/init/browser.js';
import registerBiaofengMenu from '/additions/biaofeng-menu.js';
import registerQuickDuel from '/additions/quick-duel.js';

export default async function preload(context) {
  await browserReady(context);
  registerBiaofengMenu(context.lib, context.get);
  context.lib.hallURL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  registerQuickDuel(context);
}
