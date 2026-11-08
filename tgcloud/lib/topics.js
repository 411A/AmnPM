import { api } from 'sdk';
import * as store from './store.js';
import { t } from './i18n.js';
import { topicName, senderTopicName, customTopicName } from './render.js';
import { linkMemo, conversationLabel, linkToken, topicLabel } from './keys.js';
import { EMOJI } from './constants.js';

const STALE_SECONDS = 60;

export async function ensureTopic(link, chatId, kind, conversationId, name) {
  const now = Math.floor(Date.now() / 1000);
  let existing = await store.getTopic(link.id, kind, conversationId);

  if (existing?.state === 'creating') {
    if (existing.created_at > now - STALE_SECONDS) {
      return { thread: 0, created: false, pending: true };
    }
    if (!(await store.takeStaleTopic(existing.id, now - STALE_SECONDS, now))) {
      return { thread: 0, created: false, pending: true };
    }
  } else if (existing) {
    if (existing.name && !existing.name.startsWith('enc:')) {
      await store.updateTopic(existing.id, existing.thread_id, '', existing.state);
    }
    return { thread: existing.thread_id, created: false };
  }

  let topicId = existing?.id;
  if (!topicId) {
    const reserved = await store.reserveTopic({
      link_id: link.id,
      kind,
      conversation_id: conversationId,
      created_at: now,
    });
    if (!reserved) {
      const row = await store.getTopic(link.id, kind, conversationId);
      if (row?.state === 'creating') return { thread: 0, created: false, pending: true };
      return { thread: row?.thread_id ?? 0, created: false };
    }
    const row = await store.getTopic(link.id, kind, conversationId);
    topicId = row.id;
  }

  try {
    const topic = await api.createForumTopic({ chat_id: chatId, name });
    await store.updateTopicState(topicId, topic.message_thread_id, 'open');
    return { thread: topic.message_thread_id, created: true };
  } catch {
    // shortcut: a failed creation is cached as unavailable until the link is revoked;
    // retry would cost an API call on every message for owners without topics.
    await store.updateTopicState(topicId, 0, 'unavailable');
    return { thread: 0, created: true };
  }
}

async function topicDisplayName(link, topic, memoText) {
  // A name that cannot decrypt must not kill the caller, and must not be
  // replaced by a guessed default either: null means "leave this topic alone".
  try {
    const custom = await topicLabel(link, topic);
    if (custom) return customTopicName(topic.kind, custom, memoText);
    if (topic.kind === 'anon') return topicName('anon', memoText);
    const conversation = await store.getConversationById(topic.conversation_id);
    const label = conversation ? await conversationLabel(link, conversation) : '';
    return topicName(topic.kind, memoText, label);
  } catch {
    return null;
  }
}

export async function renameTopics(link, chatId) {
  const memoText = await linkMemo(link);
  const topics = await store.listTopics(link.id);
  let failed = 0;
  let rights = false;
  for (const topic of topics) {
    if (!topic.thread_id) continue;
    const name = await topicDisplayName(link, topic, memoText);
    if (!name) {
      // Unreadable row: never overwrite a custom name with a guessed default.
      failed += 1;
      continue;
    }
    try {
      await api.editForumTopic({ chat_id: chatId, message_thread_id: topic.thread_id, name });
      await store.updateTopic(
        topic.id,
        topic.thread_id,
        topic.name?.startsWith('enc:') ? topic.name : '',
        topic.state,
      );
    } catch (err) {
      // keep the old name; the memo change is still stored
      failed += 1;
      rights = rights || /admin|right|privileg|permission|forbidden|chat_admin_required/i
        .test(String(err?.description ?? err ?? ''));
    }
  }
  return { failed, rights };
}

export async function ensureSenderTopic(link, chatId, senderKey, now) {
  let existing = await store.getSenderTopic(link.id, senderKey);
  const name = senderTopicName(await linkToken(link));

  if (existing?.state === 'creating') {
    if (existing.created_at > now - STALE_SECONDS) {
      return { thread: 0, created: false, pending: true };
    }
    if (!(await store.takeStaleSenderTopic(existing.id, now - STALE_SECONDS, now))) {
      return { thread: 0, created: false, pending: true };
    }
  } else if (existing?.state === 'unavailable') {
    if (!(await store.retrySenderTopic(existing.id, now))) {
      const row = await store.getSenderTopic(link.id, senderKey);
      if (row?.state === 'creating') return { thread: 0, created: false, pending: true };
      return { thread: row?.thread_id ?? 0, created: false };
    }
  } else if (existing) {
    return { thread: existing.thread_id, created: false };
  }

  let topicId = existing?.id;
  if (!topicId) {
    const reserved = await store.reserveSenderTopic({
      link_id: link.id,
      sender_key: senderKey,
      created_at: now,
    });
    if (!reserved) {
      const row = await store.getSenderTopic(link.id, senderKey);
      if (row?.state === 'creating') return { thread: 0, created: false, pending: true };
      return { thread: row?.thread_id ?? 0, created: false };
    }
    const row = await store.getSenderTopic(link.id, senderKey);
    topicId = row.id;
  }

  try {
    const topic = await api.createForumTopic({ chat_id: chatId, name });
    await store.updateSenderTopic(topicId, topic.message_thread_id, 'open');
    return { thread: topic.message_thread_id, created: true };
  } catch {
    await store.updateSenderTopic(topicId, 0, 'unavailable');
    return { thread: 0, created: true };
  }
}

// The stored topic is gone or closed: create a replacement and repoint the row.
export async function recreateSenderTopic(link, chatId, senderKey, now) {
  const existing = await store.getSenderTopic(link.id, senderKey);
  if (existing) {
    if (!(await store.beginSenderRecreate(existing.id, existing.thread_id, now))) {
      const row = await store.getSenderTopic(link.id, senderKey);
      return row?.state === 'open' ? row.thread_id : 0;
    }
  }
  try {
    const name = senderTopicName(await linkToken(link));
    const topic = await api.createForumTopic({ chat_id: chatId, name });
    if (existing) {
      await store.updateSenderTopic(existing.id, topic.message_thread_id, 'open');
    } else {
      await store.createSenderTopic({
        link_id: link.id,
        sender_key: senderKey,
        thread_id: topic.message_thread_id,
        name: '',
        state: 'open',
        created_at: now,
      });
    }
    return topic.message_thread_id;
  } catch {
    if (existing) await store.updateSenderTopic(existing.id, 0, 'unavailable');
    return 0;
  }
}

// The stored owner topic is dead (Telegram rejects every write to it): create
// a replacement and repoint the row, like recreateSenderTopic does for senders.
export async function recreateOwnerTopic(link, chatId, kind, conversationId, now) {
  const existing = await store.getTopic(link.id, kind, conversationId ?? 0);
  if (existing) {
    if (!(await store.beginTopicRecreate(existing.id, existing.thread_id, now))) {
      const row = await store.getTopic(link.id, kind, conversationId ?? 0);
      if (row?.state === 'open' && row.thread_id) return row.thread_id;
    }
  }

  const memoText = await linkMemo(link);
  let label = '';
  if (conversationId) {
    const conversation = await store.getConversationById(conversationId);
    if (conversation) label = await conversationLabel(link, conversation);
  }
  const name = topicName(kind, memoText, label);

  try {
    const topic = await api.createForumTopic({ chat_id: chatId, name });
    if (existing) {
      await store.updateTopic(
        existing.id,
        topic.message_thread_id,
        existing.name?.startsWith('enc:') ? existing.name : '',
        'open',
      );
    } else {
      await store.createTopic({
        link_id: link.id,
        kind,
        conversation_id: conversationId ?? 0,
        thread_id: topic.message_thread_id,
        name: '',
        state: 'open',
        created_at: now,
      });
    }
    if (conversationId) await store.setConversationTopic(conversationId, topic.message_thread_id);
    return topic.message_thread_id;
  } catch {
    if (existing) await store.updateTopicState(existing.id, 0, 'unavailable');
    return 0;
  }
}

// A renamed topic must not share its label with another custom topic in the
// same forum: same-kind/same-memo displays cannot collide structurally, but
// equal labels across kinds or links read as the same topic. Sender topics
// need no check: each lives in a different private chat, so they never share
// visibility.
export async function isTopicNameTaken(ownerKey, link, label, exceptId) {
  const wanted = label.toLowerCase();
  for (const owned of await store.listLinks(ownerKey)) {
    const rowLink = owned.id === link.id ? link : await store.getLink(owned.id);
    if (!rowLink) continue;
    for (const row of await store.listTopics(rowLink.id)) {
      if (row.id === exceptId) continue;
      // A row that cannot decrypt is unknown, not a collision.
      let custom = '';
      try {
        custom = await topicLabel(rowLink, row);
      } catch {
        continue;
      }
      if (custom && custom.toLowerCase() === wanted) return true;
    }
  }
  return false;
}

export async function closeLinkTopics(link, chatId, lang, notify = true) {
  const topics = await store.listTopics(link.id);
  const memoText = await linkMemo(link);
  for (const topic of topics) {
    if (!topic.thread_id) continue;
    if (notify) {
      try {
        await api.sendMessage({
          chat_id: chatId,
          message_thread_id: topic.thread_id,
          text: t(lang, 'topicClosed'),
        });
      } catch {
        // best effort
      }
    }
    try {
      await api.closeForumTopic({ chat_id: chatId, message_thread_id: topic.thread_id });
      await store.updateTopic(topic.id, topic.thread_id, '', 'closed');
    } catch {
      // closeForumTopic is supergroup-only. In a private bot chat, mark the
      // topic name instead so it still reads as closed; the bot rejects writes.
      try {
        const name = (await topicDisplayName(link, topic, memoText)) ?? topicName(topic.kind, memoText, '');
        await api.editForumTopic({
          chat_id: chatId,
          message_thread_id: topic.thread_id,
          name: `${name} · ${EMOJI.cross}`,
        });
        await store.updateTopic(topic.id, topic.thread_id, '', 'closed');
      } catch {
        // leave it open if both close and rename fail
      }
    }
  }
}
