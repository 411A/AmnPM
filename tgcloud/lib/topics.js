import { api } from 'sdk';
import * as store from './store.js';
import { t } from './i18n.js';
import { topicName, senderTopicName, customTopicName } from './render.js';
import { linkMemo, conversationLabel, linkToken, topicLabel } from './keys.js';

export async function ensureTopic(link, chatId, kind, conversationId, name) {
  const existing = await store.getTopic(link.id, kind, conversationId);
  if (existing) {
    if (existing.name && !existing.name.startsWith('enc:')) {
      await store.updateTopic(existing.id, existing.thread_id, '', existing.state);
    }
    return { thread: existing.thread_id, created: false };
  }

  try {
    const topic = await api.createForumTopic({ chat_id: chatId, name });
    await store.createTopic({
      link_id: link.id,
      kind,
      conversation_id: conversationId,
      thread_id: topic.message_thread_id,
      name: '',
      state: 'open',
    });
    return { thread: topic.message_thread_id, created: true };
  } catch {
    // shortcut: a failed creation is cached as unavailable until the link is revoked;
    // retry would cost an API call on every message for owners without topics.
    await store.createTopic({
      link_id: link.id,
      kind,
      conversation_id: conversationId,
      thread_id: 0,
      name: '',
      state: 'unavailable',
    });
    return { thread: 0, created: true };
  }
}

export async function renameTopics(link, chatId) {
  const memoText = await linkMemo(link);
  const topics = await store.listTopics(link.id);
  for (const topic of topics) {
    if (!topic.thread_id) continue;
    const custom = await topicLabel(link, topic);
    let name;
    if (custom) {
      name = customTopicName(topic.kind, custom);
    } else if (topic.kind === 'anon') {
      name = topicName('anon', memoText);
    } else {
      const conversation = await store.getConversationById(topic.conversation_id);
      const label = conversation ? await conversationLabel(link, conversation) : '';
      name = topicName(topic.kind, memoText, label);
    }
    try {
      await api.editForumTopic({ chat_id: chatId, message_thread_id: topic.thread_id, name });
      await store.updateTopic(
        topic.id,
        topic.thread_id,
        topic.name?.startsWith('enc:') ? topic.name : '',
        topic.state,
      );
    } catch {
      // keep the old name; the memo change is still stored
    }
  }
}

export async function ensureSenderTopic(link, chatId, senderKey, now) {
  const existing = await store.getSenderTopic(link.id, senderKey);
  const name = senderTopicName(await linkToken(link));

  if (existing) return { thread: existing.thread_id, created: false };

  try {
    const topic = await api.createForumTopic({ chat_id: chatId, name });
    await store.createSenderTopic({
      link_id: link.id,
      sender_key: senderKey,
      thread_id: topic.message_thread_id,
      name: '',
      state: 'open',
      created_at: now,
    });
    return { thread: topic.message_thread_id, created: true };
  } catch {
    await store.createSenderTopic({
      link_id: link.id,
      sender_key: senderKey,
      thread_id: 0,
      name: '',
      state: 'unavailable',
      created_at: now,
    });
    return { thread: 0, created: true };
  }
}

export async function closeLinkTopics(link, chatId, lang) {
  const topics = await store.listTopics(link.id);
  for (const topic of topics) {
    if (!topic.thread_id) continue;
    try {
      await api.sendMessage({
        chat_id: chatId,
        message_thread_id: topic.thread_id,
        text: t(lang, 'topicClosed'),
      });
    } catch {
      // best effort
    }
    try {
      await api.closeForumTopic({ chat_id: chatId, message_thread_id: topic.thread_id });
      await store.updateTopic(topic.id, topic.thread_id, '', 'closed');
    } catch {
      // close is not available in every chat; leave it open
    }
  }
}
