import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { escapeHtml, cleanLabel } from './ids.js';
import { EMOJI, LTR_MARK } from './constants.js';
import { MODES } from './modes.js';

const ltr = (name) => `${LTR_MARK}${name}`;

export function verifyLine(lang = 'en') {
  return `${EMOJI.check} <a href="${escapeHtml(CONFIG.repoUrl)}">${t(lang, 'verifyOk')}</a>`;
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
  return t(lang, 'welcome', { verify: verifyLine(lang), repo: escapeHtml(CONFIG.repoUrl) });
}

export function linkIntro(lang, link, memo) {
  return t(lang, 'linkIntro', {
    link,
    memo: escapeHtml(memo),
    guide: t(lang, 'linkGuide'),
  });
}

export function about(lang) {
  return t(lang, 'about', {
    contact: escapeHtml(CONFIG.contactUrl),
    repo: escapeHtml(CONFIG.repoUrl),
    developer: escapeHtml(CONFIG.developerUrl),
    verify: verifyLine(lang),
  });
}

export function aboutButtons(lang) {
  return {
    inline_keyboard: [[
      { text: t(lang, 'contactDeveloper'), url: CONFIG.developerBotUrl },
      { text: t(lang, 'developerChannel'), url: CONFIG.developerUrl },
    ]],
  };
}

export function topicPrefix(kind) {
  if (kind === 'anon') return `${EMOJI.receiver} ${EMOJI.anon} `;
  if (kind === 'history') return `${EMOJI.receiver} ${EMOJI.history} `;
  return `${EMOJI.receiver} ${EMOJI.forward} `;
}

export function customTopicName(kind, custom, memo) {
  const tail = cleanLabel(memo, 40);
  return ltr(`${topicPrefix(kind)}${cleanLabel(custom, 60)}${tail ? ` · ${tail}` : ''}`);
}

export function customSenderTopicName(custom) {
  return ltr(`${EMOJI.sender} ${cleanLabel(custom, 60)}`);
}

export function topicName(kind, memo, label) {
  const tail = cleanLabel(memo, 40);
  if (kind === 'anon') return ltr(`${EMOJI.receiver} ${EMOJI.anon} Anonymous · ${tail}`);
  if (kind === 'history') {
    return ltr(`${EMOJI.receiver} ${EMOJI.history} ${cleanLabel(label, 30)} · ${tail}`);
  }
  return ltr(`${EMOJI.receiver} ${EMOJI.forward} ${cleanLabel(label, 30)} · ${tail}`);
}

export function senderTopicName(token) {
  return ltr(`${EMOJI.sender} ${cleanLabel(token, 40)}`);
}

export function modeKeyboard(lang, callbacks, current, modes = MODES) {
  const labels = {
    anon: t(lang, 'modeAnon'),
    history: t(lang, 'modeHistory'),
    forward: t(lang, 'modeForward'),
  };
  const mark = (mode) => (current === mode ? `${labels[mode]} ${EMOJI.selected}` : labels[mode]);
  const rows = [];
  for (const mode of MODES.filter((entry) => modes.includes(entry))) {
    rows.push([{ text: mark(mode), callback_data: callbacks[mode] }]);
  }
  return { inline_keyboard: rows };
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
