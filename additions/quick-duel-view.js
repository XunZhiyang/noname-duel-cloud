// SPDX-License-Identifier: GPL-3.0-only
// A small invitation screen around the original game's online flow.
const ROOT_ID = 'noname-quick-duel';
const ENTRY_ID = 'noname-quick-duel-entry';
const STYLE_ID = 'noname-quick-duel-style';
const views = new WeakMap();

function installStyle(document) {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./quick-duel.css', import.meta.url).href;
  (document.head || document.documentElement).append(link);
}

function node(document, tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createQuickDuelView({ document, location, navigator }) {
  const existing = views.get(document);
  if (existing) return existing;
  installStyle(document);
  const overlay = node(document, 'div', 'nqd-overlay');
  overlay.id = ROOT_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'nqd-title');
  const stopNativeInput = event => event.stopPropagation();
  const inputEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'];
  // Native document-level input handlers must not treat invitation controls as
  // game interactions. Default browser selection, scrolling and clicks remain.
  for (const name of inputEvents) overlay.addEventListener(name, stopNativeInput, { passive: true });
  const panel = node(document, 'section', 'nqd-panel');
  const eyebrow = node(document, 'p', 'nqd-eyebrow', '无名杀 · 双人对局');
  const heading = node(document, 'h1', 'nqd-title', '快捷标风 1v1');
  heading.id = 'nqd-title';
  const introduction = node(document, 'p', 'nqd-intro', '对方点开邀请链接，双方到齐自动开始选将。');
  const statusRow = node(document, 'div', 'nqd-status');
  const indicator = node(document, 'span', 'nqd-indicator');
  indicator.setAttribute('aria-hidden', 'true');
  const statusText = node(document, 'p', 'nqd-status-text');
  statusText.setAttribute('role', 'status');
  statusText.setAttribute('aria-live', 'polite');
  statusText.setAttribute('aria-atomic', 'true');
  statusRow.append(indicator, statusText);

  const invite = node(document, 'div', 'nqd-invite');
  const inviteLabel = node(document, 'label', 'nqd-label', '邀请链接');
  inviteLabel.htmlFor = 'nqd-invite-url';
  const inviteRow = node(document, 'div', 'nqd-invite-row');
  const inviteInput = node(document, 'input', 'nqd-input');
  inviteInput.id = 'nqd-invite-url';
  inviteInput.type = 'text';
  inviteInput.readOnly = true;
  inviteInput.spellcheck = false;
  inviteInput.autocomplete = 'off';
  inviteInput.placeholder = '正在生成邀请链接…';
  const copyButton = node(document, 'button', 'nqd-button nqd-copy', '复制邀请链接');
  copyButton.type = 'button';
  const copyHint = node(document, 'p', 'nqd-copy-hint', '把链接发给对方，然后留在此页等待。');
  copyHint.setAttribute('role', 'status');
  copyHint.setAttribute('aria-live', 'polite');
  inviteRow.append(inviteInput, copyButton);
  invite.append(inviteLabel, inviteRow, copyHint);

  const actions = node(document, 'div', 'nqd-actions');
  const retryButton = node(document, 'button', 'nqd-button nqd-retry', '重新连接');
  retryButton.type = 'button';
  const newGame = node(document, 'a', 'nqd-button nqd-secondary', '创建新对局');
  newGame.href = '/?quick=host';
  actions.append(retryButton, newGame);
  const slowNote = node(document, 'p', 'nqd-note', '免费服务首次打开可能稍慢，请稍候。');
  const hallLink = node(document, 'a', 'nqd-hall', '返回入口');
  hallLink.href = '/';
  panel.append(eyebrow, heading, introduction, statusRow, invite, actions, slowNote, hallLink);
  overlay.append(panel);
  // Native game zoom transforms <body>. Mount alongside it so this invitation
  // stays aligned with the actual viewport on phones and scaled game layouts.
  document.documentElement.append(overlay);

  let removed = false;
  let currentPhase = 'loading';
  let currentUrl = '';
  let copying = false;
  function selectLink() {
    inviteInput.focus();
    inviteInput.select();
    inviteInput.setSelectionRange?.(0, inviteInput.value.length);
  }
  async function copyLink() {
    if (removed || copying || !currentUrl || currentPhase !== 'waiting') return;
    const value = currentUrl;
    copying = true;
    copyButton.disabled = true;
    try {
      // Only the user's click reaches this write; never read the clipboard.
      if (!navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (!removed && currentUrl === value) {
        copyButton.textContent = '已复制';
        copyHint.textContent = '链接已复制，发给对方即可。';
      }
    } catch {
      if (!removed && currentUrl === value) {
        selectLink();
        copyButton.textContent = '复制邀请链接';
        copyHint.textContent = '链接已选中，请长按或使用复制。';
      }
    } finally {
      copying = false;
      copyButton.disabled = !currentUrl || currentPhase !== 'waiting';
    }
  }
  function retry() { location.reload(); }
  copyButton.addEventListener('click', copyLink);
  retryButton.addEventListener('click', retry);
  inviteInput.addEventListener('click', selectLink);

  const view = {
    update({ phase = currentPhase, status, inviteUrl = currentUrl } = {}) {
      if (removed) return;
      if (phase === 'playing') { view.remove(); return; }
      currentPhase = ['loading', 'waiting', 'joining', 'error'].includes(phase) ? phase : 'loading';
      overlay.dataset.phase = currentPhase;
      eyebrow.textContent = currentPhase === 'waiting' ? '已创建对局 · 等待对方' : '无名杀 · 双人对局';
      const defaults = {
        loading: '正在建立对局…',
        waiting: '对局已创建，等待对方加入',
        joining: '正在加入对局…',
        error: '暂时未能连接，请再试一次。',
      };
      statusText.textContent = typeof status === 'string' && status.trim() ? status : defaults[currentPhase];
      const nextUrl = currentPhase !== 'error' && typeof inviteUrl === 'string' ? inviteUrl : '';
      if (nextUrl !== currentUrl) {
        currentUrl = nextUrl;
        inviteInput.value = currentUrl;
        copyButton.textContent = '复制邀请链接';
        copyHint.textContent = '把链接发给对方，然后留在此页等待。';
      }
      invite.hidden = currentPhase !== 'waiting';
      actions.hidden = currentPhase !== 'error';
      slowNote.hidden = currentPhase === 'waiting' || currentPhase === 'error';
      copyButton.disabled = copying || !currentUrl || currentPhase !== 'waiting';
      overlay.setAttribute('aria-busy', String(currentPhase === 'loading' || currentPhase === 'joining'));
    },
    remove() {
      if (removed) return;
      removed = true;
      copyButton.removeEventListener('click', copyLink);
      retryButton.removeEventListener('click', retry);
      inviteInput.removeEventListener('click', selectLink);
      for (const name of inputEvents) overlay.removeEventListener(name, stopNativeInput);
      overlay.remove();
      views.delete(document);
    },
  };
  views.set(document, view);
  view.update();
  return view;
}

export function addQuickDuelEntry({ document, location }) {
  installStyle(document);
  const existing = document.getElementById(ENTRY_ID);
  if (existing) return existing;
  const link = node(document, 'a', 'nqd-entry', '快捷 1v1');
  link.id = ENTRY_ID;
  link.href = '/?quick=host';
  link.setAttribute('aria-label', '创建快捷标风 1v1 对局');
  document.documentElement.append(link);
  return link;
}

export default createQuickDuelView;
