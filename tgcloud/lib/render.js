import { CONFIG } from './config.js';
import { BUILD } from './build.js';
import { t } from './i18n.js';
import { escapeHtml, cleanLabel } from './ids.js';
import { EMOJI, LTR_MARK } from './constants.js';

const ltr = (name) => `${LTR_MARK}${name}`;

export function verifyLine() {
  const base = CONFIG.repoUrl;
  const page = BUILD.release && BUILD.release !== 'dev'
    ? `${base}/releases/tag/${encodeURIComponent(BUILD.release)}`
    : `${base}/releases`;
  const link = escapeHtml(page);
  const label = BUILD.verified
    ? `${EMOJI.check} <a href="${link}">verified · ${escapeHtml(BUILD.release)}</a>`
    : `${EMOJI.unverified} <a href="${link}">unverified release</a>`;
  return `${label}\n<blockquote>${escapeHtml(BUILD.bundleHash)}</blockquote>`;
}

export function shareUrl(link) {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Message me anonymously')}`;
}

export function linkButtons(link) {
  return {
    inline_keyboard: [[
      { text: `${EMOJI.link} Open`, url: link },
      { text: `${EMOJI.share} Share`, url: shareUrl(link) },
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

export function topicPrefix(kind) {
  if (kind === 'anon') return `${EMOJI.down} ${EMOJI.anon} `;
  if (kind === 'history') return `${EMOJI.down} ${EMOJI.history} `;
  return `${EMOJI.down} ${EMOJI.forward} `;
}

export function customTopicName(kind, custom, memo) {
  const tail = cleanLabel(memo, 40);
  return ltr(`${topicPrefix(kind)}${cleanLabel(custom, 60)}${tail ? ` · ${tail}` : ''}`);
}

export function customSenderTopicName(custom) {
  return ltr(`${EMOJI.up} ${cleanLabel(custom, 60)}`);
}

export function topicName(kind, memo, label) {
  const tail = cleanLabel(memo, 40);
  if (kind === 'anon') return ltr(`${EMOJI.down} ${EMOJI.anon} Anonymous · ${tail}`);
  if (kind === 'history') {
    return ltr(`${EMOJI.down} ${EMOJI.history} ${cleanLabel(label, 30)} · ${tail}`);
  }
  return ltr(`${EMOJI.down} ${EMOJI.forward} ${cleanLabel(label, 30)} · ${tail}`);
}

export function senderTopicName(token) {
  return ltr(`${EMOJI.up} ${cleanLabel(token, 40)}`);
}

export function modeKeyboard(lang, callbacks, current) {
  const mark = (mode, label) => (current === mode ? `${label} ${EMOJI.selected}` : label);
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
