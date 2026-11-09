import { api } from 'sdk';
import * as store from './store.js';
import { EMOJI, RTL_MARK } from './constants.js';

// Bump to reapply bot metadata on the next /start.
const CONFIG_VERSION = 8;

const NAME = 'AmnPM';

const COMMANDS_EN = [
  { command: 'start', description: `${EMOJI.start} Start here` },
  { command: 'newlink', description: `${EMOJI.link} Create a link` },
  { command: 'settings', description: `${EMOJI.control} Settings & manage links` },
  { command: 'rename', description: `${EMOJI.tag} Rename this topic` },
  { command: 'help', description: `${EMOJI.book} Commands & usage` },
  { command: 'privacy', description: `${EMOJI.lock} What is stored` },
  { command: 'security', description: `${EMOJI.lock} Security model` },
  { command: 'about', description: `${EMOJI.info} Version & source` },
];

const COMMANDS_FA = [
  { command: 'start', description: `${EMOJI.start} شروع` },
  { command: 'newlink', description: `${EMOJI.link} ساخت لینک` },
  { command: 'settings', description: `${EMOJI.control} تنظیمات و مدیریت لینک‌ها` },
  { command: 'rename', description: `${EMOJI.tag} تغییر نام موضوع` },
  { command: 'help', description: `${EMOJI.book} دستورات و راهنما` },
  { command: 'privacy', description: `${EMOJI.lock} چه چیزی ذخیره می‌شود` },
  { command: 'security', description: `${EMOJI.lock} مدل امنیتی` },
  { command: 'about', description: `${EMOJI.info} نسخه و منبع` },
];

const DESCRIPTION_EN =
  'AmnPM turns one link into a private, anonymous inbox. Create a link, share it, and receive messages without exposing your identity. Owners can answer, block, and revoke links.';
const DESCRIPTION_FA =
  `${RTL_MARK}AmnPM یک لینک را به صندوق خصوصی و ناشناس تبدیل می‌کند. لینک بسازید، به اشتراک بگذارید و بدون افشای هویت پیام دریافت کنید. صاحب لینک می‌تواند پاسخ دهد، مسدود کند و لینک را حذف کند.`;

const SHORT_EN = 'Private, anonymous inboxes behind one link. Create a link, share it, receive messages.';
const SHORT_FA = 'صندوق خصوصی و ناشناس با یک لینک. لینک بسازید، به اشتراک بگذارید و پیام دریافت کنید.';

async function apply() {
  if (await store.getMeta('bot_config_version') !== String(CONFIG_VERSION)) {
    await Promise.all([
      api.setMyName({ name: NAME }),
      api.setMyCommands({ commands: COMMANDS_EN }),
      api.setMyCommands({ commands: COMMANDS_FA, language_code: 'fa' }),
      api.setMyDescription({ description: DESCRIPTION_EN }),
      api.setMyDescription({ description: DESCRIPTION_FA, language_code: 'fa' }),
      api.setMyShortDescription({ short_description: SHORT_EN }),
      api.setMyShortDescription({ short_description: SHORT_FA, language_code: 'fa' }),
      api.setChatMenuButton({ menu_button: { type: 'commands' } }),
    ]);
    await store.setMeta('bot_config_version', String(CONFIG_VERSION));
  }
}

// Called fire-and-forget from /start. Never blocks the update.
export function configureBotOnce() {
  return apply().catch(() => undefined);
}
