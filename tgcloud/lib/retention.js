import { api } from 'sdk';
import * as store from './store.js';
import * as ids from './ids.js';
import { linkMemo, ownerChatId } from './keys.js';
import { t } from './i18n.js';
import { purgeLink } from './lifecycle.js';

export const REMIND_AFTER = 335 * 86_400;
export const PURGE_AFTER = 365 * 86_400;
export const SWEEP_INTERVAL = 168 * 3_600;
export const RECONCILE_INTERVAL = 24 * 3_600;

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
      const { memo } = await purgeLink(fresh, chat, lang, now);
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
}

async function purgeStale(now) {
  for (const link of await store.listStalePurging(now - PURGE_STALE_AFTER, 1)) {
    try {
      let chat = 0;
      try {
        chat = await ownerChatId(link);
      } catch {
        // delete the rows even without a chat id
      }
      await purgeLink(link, chat, await ownerLang(link.owner_key), now);
    } catch {
      // leave it for the next sweep
    }
  }
}

async function purgeBroken(now) {
  for (const link of await store.listBrokenLinks(PURGE_BATCH)) {
    try {
      let chat = 0;
      try {
        chat = await ownerChatId(link);
      } catch {
        // delete the rows even without a chat id
      }
      await purgeLink(link, chat, await ownerLang(link.owner_key), now);
    } catch {
      // leave it for the next sweep
    }
  }
}

// Runs at most once per 168 hours. The first run after deploy dates every
// existing link from that moment, so older rows get a full grace period.
export async function maybeSweep(now) {
  if (!(await store.claimRetentionLease(now, now + 3_600, SWEEP_INTERVAL))) return false;
  try {
    await store.backfillLinkActivity(now);
    await sendReminders(now);
    await purgeExpired(now);
    await purgeBroken(now);
    await purgeStale(now);
    await store.finishRetention(now);
    return true;
  } catch (err) {
    await store.releaseRetention(now);
    throw err;
  }
}

// Once per owner per 24 hours, in the background of an owner update. Two
// consecutive misses are required before a topic is treated as deleted.
export async function maybeReconcileOwner(ownerKey, chatId, now) {
  if (!(await store.claimOwnerReconcile(ownerKey, now, now - RECONCILE_INTERVAL))) return false;

  let listed;
  try {
    listed = await api.getForumTopics({ chat_id: chatId, limit: 100 });
  } catch {
    return false;
  }
  const list = Array.isArray(listed) ? listed : listed?.topics;
  // A full page may omit later topics; never infer deletion from a partial list.
  if (!Array.isArray(list) || list.length >= 100) return false;

  const live = new Set(
    list
      .map((topic) => Number(topic?.message_thread_id ?? topic?.thread_id ?? topic?.id))
      .filter(Boolean),
  );
  const topics = await store.listOwnerTopics(ownerKey);
  if (!topics.length) return false;

  const checkedLinks = new Set();
  for (const topic of topics) {
    if (live.has(Number(topic.thread_id))) {
      if (topic.state === 'missing' || topic.state === 'dead') {
        await store.setTopicState(topic.id, 'open');
      }
      continue;
    }
    if (topic.state === 'missing') {
      await store.setTopicState(topic.id, 'dead');
      checkedLinks.add(topic.link_id);
    } else if (topic.state !== 'dead') {
      await store.setTopicState(topic.id, 'missing');
    }
  }

  for (const linkId of checkedLinks) {
    const link = await store.getLink(linkId);
    if (!link || link.state !== 'active') continue;
    const rows = await store.listLinkTopics(linkId);
    if (!rows.length || !rows.every((topic) => topic.state === 'dead')) continue;
    if (!(await store.claimLinkPurge(link.id, now))) continue;
    const fresh = await store.getLink(link.id);
    if (!fresh) continue;
    let chat = 0;
    try {
      chat = await ownerChatId(fresh);
    } catch {
      // delete the rows even without a chat id
    }
    try {
      await purgeLink(fresh, chat, await ownerLang(fresh.owner_key), now);
    } catch {
      // a stale row is retried by the retention sweep
    }
  }
  return true;
}
