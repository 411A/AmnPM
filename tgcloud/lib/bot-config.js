import { api } from 'sdk';
import * as store from './store.js';

// Bump either version to reapply that part on the next /start.
const CONFIG_VERSION = 1;
const PHOTO_VERSION = 1;

// Public JPG used only while setting the bot photo; Telegram copies it.
const PHOTO_URL = 'https://ui-avatars.com/api/?name=AmnPM&background=0B1F1C&color=E8FFF8&size=512&bold=true&format=jpg';

const NAME = 'AmnPM';

const COMMANDS_EN = [
  { command: 'start', description: 'Start AmnPM' },
  { command: 'newlink', description: 'Create an anonymous link' },
  { command: 'links', description: 'Manage your links' },
  { command: 'rename', description: 'Rename the current topic (emoji prefix stays)' },
  { command: 'help', description: 'Commands and usage' },
  { command: 'about', description: 'About this bot' },
];

const COMMANDS_FA = [
  { command: 'start', description: 'شروع AmnPM' },
  { command: 'newlink', description: 'ساخت لینک ناشناس' },
  { command: 'links', description: 'مدیریت لینک‌ها' },
  { command: 'rename', description: 'تغییر نام موضوع (ایموجی ثابت می‌ماند)' },
  { command: 'help', description: 'دستورها و راهنما' },
  { command: 'about', description: 'درباره ربات' },
];

const DESCRIPTION_EN =
  'AmnPM turns one link into a private, anonymous inbox. Create a link, share it, and receive messages without exposing your identity. Owners can answer, block, and revoke links.';
const DESCRIPTION_FA =
  'AmnPM یک لینک را به صندوق خصوصی و ناشناس تبدیل می‌کند. لینک بسازید، به اشتراک بگذارید و بدون افشای هویت پیام دریافت کنید. صاحب لینک می‌تواند پاسخ دهد، مسدود کند و لینک را حذف کند.';

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

  if (!PHOTO_URL) {
    await store.setMeta('bot_photo_version', String(PHOTO_VERSION));
    return;
  }
  if (await store.getMeta('bot_photo_version') !== String(PHOTO_VERSION)) {
    try {
      await api.setMyProfilePhoto({ photo: { type: 'static', photo: PHOTO_URL } });
      await store.setMeta('bot_photo_version', String(PHOTO_VERSION));
    } catch {
      // The core metadata is already applied; retry the photo on a later /start.
    }
  }
}

// Called fire-and-forget from /start. Never blocks the update.
export function configureBotOnce() {
  return apply().catch(() => undefined);
}
