import { api } from 'sdk';
import * as store from './store.js';
import * as ids from './ids.js';
import * as render from './render.js';
import { t } from './i18n.js';
import { ownerChatId, sealJob, linkMemo, sealConversationLabel, conversationLabel } from './keys.js';
import { ensureTopic } from './topics.js';

async function conversationFor(link, senderKey, mode, firstName, now) {
  const existing = await store.getConversation(link.id, senderKey, mode);
  if (existing) return existing;
  const label = mode === 'history'
    ? await ids.makeIndicator(senderKey, firstName)
    : ids.cleanLabel(firstName, 30);
  const indicator = await sealConversationLabel(link, label, senderKey, mode);
  await store.createConversation({
    link_id: link.id,
    sender_key: senderKey,
    mode,
    indicator,
    topic_id: 0,
    created_at: now,
    last_at: now,
  });
  return store.getConversation(link.id, senderKey, mode);
}

async function ensureDelivery(link, ownerChat, senderKey, mode, firstName, now) {
  const memoText = await linkMemo(link);
  const memo = ids.escapeHtml(memoText);
  const owner = await store.getOwner(link.owner_key);
  const lang = owner?.lang ?? 'en';

  if (mode === 'anon') {
    const { thread, created } = await ensureTopic(link, ownerChat, 'anon', 0, render.topicName('anon', memoText));
    if (created && !thread) {
      await api.sendMessage({ chat_id: ownerChat, text: t(lang, 'topicsDisabled') });
    }
    return { kind: 'copy', thread, indicator: null, header: `🥷 Anonymous · ${memo}` };
  }

  const conversation = await conversationFor(link, senderKey, mode, firstName, now);
  const label = await conversationLabel(link, conversation);
  const { thread } = await ensureTopic(
    link,
    ownerChat,
    mode,
    conversation.id,
    render.topicName(mode, memoText, label),
  );
  if (thread && conversation.topic_id !== thread) {
    await store.setConversationTopic(conversation.id, thread);
  }
  await store.touchConversation(conversation.id, now);

  return {
    kind: mode === 'forward' ? 'forward' : 'copy',
    thread,
    indicator: label,
    header: mode === 'history'
      ? `💬 ${label} · ${memo}`
      : `👤 ${ids.escapeHtml(label)} · ${memo}`,
  };
}

export async function deliver(link, senderId, senderKey, mode, messageIds, firstName, now) {
  const ownerChat = await ownerChatId(link);
  const target = await ensureDelivery(link, ownerChat, senderKey, mode, firstName, now);
  await sealJob(link, target.kind, {
    chat_id: ownerChat,
    thread_id: target.thread,
    from_chat_id: senderId,
    message_ids: messageIds,
    sender_key: senderKey,
    header: target.header,
  }, now);
  return target;
}
