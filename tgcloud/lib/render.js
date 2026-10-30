import { CONFIG } from './config.js';
import { BUILD } from './build.js';
import { t } from './i18n.js';
import { escapeHtml, cleanLabel } from './ids.js';

export function verifyLine() {
  const manifest = escapeHtml(CONFIG.manifestUrl);
  return BUILD.verified
    ? `✅ <a href="${manifest}">verified · ${escapeHtml(BUILD.release)}</a>`
    : `⚪️ <a href="${manifest}">unverified release</a>`;
}

export function shareUrl(link) {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Message me anonymously')}`;
}

export function linkButtons(link) {
  return {
    inline_keyboard: [[
      { text: '🔗 Open', url: link },
      { text: '📤 Share', url: shareUrl(link) },
    ]],
  };
}

export function welcome(lang) {
  return t(lang, 'welcome', { verify: verifyLine(), repo: escapeHtml(CONFIG.repoUrl) });
}

export function linkIntro(lang, link, memo) {
  return t(lang, 'linkIntro', { link, memo: escapeHtml(memo) });
}

export function about(lang) {
  return t(lang, 'about', {
    contact: escapeHtml(CONFIG.contactUrl),
    repo: escapeHtml(CONFIG.repoUrl),
    verify: verifyLine(),
  });
}

export function topicName(kind, memo, label) {
  const tail = cleanLabel(memo, 40);
  if (kind === 'anon') return `⬇️ 😶‍🌫️ Anonymous · ${tail}`;
  if (kind === 'history') return `⬇️ 😶‍🌫️💬 ${cleanLabel(label, 30)} · ${tail}`;
  return `⬇️ 😎 ${cleanLabel(label, 30)} · ${tail}`;
}

export function senderTopicName(token) {
  return `⬆️ ${cleanLabel(token, 40)}`;
}

export function modeKeyboard(lang, callbacks, current) {
  const mark = (mode, label) => (current === mode ? `${label} ✓` : label);
  return {
    inline_keyboard: [
      [{ text: mark('anon', t(lang, 'modeAnon')), callback_data: callbacks.anon }],
      [{ text: mark('history', t(lang, 'modeHistory')), callback_data: callbacks.history }],
      [{ text: mark('forward', t(lang, 'modeForward')), callback_data: callbacks.forward }],
    ],
  };
}

export function ownerKeyboard(labels) {
  return {
    inline_keyboard: [
      [
        { text: labels.answer, callback_data: labels.answerData },
        { text: labels.read, callback_data: labels.readData },
      ],
      [
        { text: labels.blockLink, callback_data: labels.blockLinkData },
        { text: labels.blockAll, callback_data: labels.blockAllData },
      ],
    ],
  };
}
