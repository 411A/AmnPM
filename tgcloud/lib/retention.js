import { api } from 'sdk';
import * as store from './store.js';
import * as ids from './ids.js';
import { linkMemo, ownerChatId } from './keys.js';
import { t } from './i18n.js';
import { purgeLink } from './lifecycle.js';

export const REMIND_AFTER = 335 * 86_400;
export const PURGE_AFTER = 365 * 86_400;
export const SWEEP_INTERVAL = 168 * 3_600;

const REMIND_BATCH = 10;
const PURGE_BATCH = 3;
const PURGE_STALE_AFTER = 3_600;

async function ownerLang(ownerKey) {
  return (await store.getOwner(ownerKey))?.lang ?? 'en';
}

async function sendReminders(now) {
  const links = await store.listLinksToRemind(now, REMIND_AFTER, PURGE_AFTER, REMIND_BATCH);
  for (const link of links) {
    if (!(await store.claimReminder(link.id, link.last_activity_at, now))) continue;
    try {
      const chat = await ownerChatId(link);
      const lang = await ownerLang(link.owner_key);
      const memo = await linkMemo(link);
      await api.sendMessage({
        chat_id: chat,
        text: t(lang, 'retentionReminder', { memo: ids.escapeHtml(memo) }),
        parse_mode: 'HTML',
      });
    } catch {
      // One attempt only: a failed reminder must not delay the expiry.
    }
  }
  return links.length >= REMIND_BATCH;
}

async function purgeExpired(now) {
  const links = await store.listLinksToPurge(now, PURGE_AFTER, PURGE_BATCH);
  for (const link of links) {
    try {
      if (!(await store.claimLinkPurge(link.id, now))) continue;
      const fresh = await store.getLink(link.id);
      if (!fresh) continue;
      let chat = 0;
      try {
        chat = await ownerChatId(fresh);
      } catch {
        // still delete the stored rows if the chat id is unreadable
      }
      const lang = await ownerLang(fresh.owner_key);
      const { memo } = await purgeLink(fresh, chat, lang, now, false);
      if (chat) {
        try {
          await api.sendMessage({
            chat_id: chat,
            text: t(lang, 'linkExpired', { memo: ids.escapeHtml(memo) }),
            parse_mode: 'HTML',
          });
        } catch {
          // the owner may have blocked the bot
        }
      }
    } catch {
      // a stale purging row is retried by the next sweep
    }
  }
  return links.length >= PURGE_BATCH;
}

async function purgeStale(now) {
  const links = await store.listStalePurging(now - PURGE_STALE_AFTER, 1);
  for (const link of links) {
    try {
      let chat = 0;
      try {
        chat = await ownerChatId(link);
      } catch {
        // delete the rows even without a chat id
      }
      await purgeLink(link, chat, await ownerLang(link.owner_key), now, false);
    } catch {
      // leave it for the next sweep
    }
  }
  return links.length >= 1;
}

async function purgeBroken(now) {
  const links = await store.listBrokenLinks(PURGE_BATCH);
  for (const link of links) {
    try {
      let chat = 0;
      try {
        chat = await ownerChatId(link);
      } catch {
        // delete the rows even without a chat id
      }
      await purgeLink(link, chat, await ownerLang(link.owner_key), now, false);
    } catch {
      // leave it for the next sweep
    }
  }
  return links.length >= PURGE_BATCH;
}

// Runs at most once per 168 hours. The first run after deploy dates every
// existing link from that moment, so older rows get a full grace period.
export async function maybeSweep(now) {
  if (!(await store.claimRetentionLease(now, now + 3_600, SWEEP_INTERVAL))) return false;
  try {
    await store.backfillLinkActivity(now);
    const moreReminders = await sendReminders(now);
    const moreExpired = await purgeExpired(now);
    const moreBroken = await purgeBroken(now);
    const moreStale = await purgeStale(now);
    if (moreReminders || moreExpired || moreBroken || moreStale) {
      await store.releaseRetention(now, 300);
    } else {
      await store.finishRetention(now);
    }
    return true;
  } catch (err) {
    await store.releaseRetention(now);
    throw err;
  }
}
