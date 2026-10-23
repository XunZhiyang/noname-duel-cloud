// Deployment-only default: keep the original browser adapter and GPL prompt.
import browserReady from '/noname/init/browser.js';

export default async function preload(context) {
  await browserReady(context);
  context.lib.hallURL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}
