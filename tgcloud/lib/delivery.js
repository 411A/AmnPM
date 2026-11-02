import { api } from 'sdk';
import * as store from './store.js';
import * as ids from './ids.js';
import * as render from './render.js';
import { t } from './i18n.js';
import { ownerChatId, sealJob, linkMemo, sealConversationLabel, conversationLabel, sealConversationChat } from './keys.js';
import { userKeyFor } from './links.js';
import { ensureTopic } from './topics.js';
import { EMOJI } from './constants.js';

async function conversationFor(link, senderKey, mode, firstName, senderId, now) {
  const existing = await store.getConversation(link.id, senderKey, mode);
  if (existing) {
    if (!existing.sender_chat_ct) {
      await store.setConversationChat(
        existing.id,
        await sealConversationChat(link, senderId, senderKey, mode),
      );
    }
    return existing;
  }
  const minted = mode === 'history'
    ? await freshIndicator(link.id, senderKey, firstName)
    : null;
  const label = minted?.label ?? ids.cleanLabel(firstName, 30);
  const indicator = await sealConversationLabel(link, label, senderKey, mode);
  const senderChat = await sealConversationChat(link, senderId, senderKey, mode);
  await store.createConversation({
    link_id: link.id,
    sender_key: senderKey,
    mode,
    indicator,
    indicator_fp: minted?.fp ?? null,
    sender_chat_ct: senderChat,
    topic_id: 0,
    created_at: now,
    last_at: now,
  });
  return store.getConversation(link.id, senderKey, mode);
}

// Three-word aliases mint from a 68-billion space; a fingerprint check per
// link plus the retired set keeps every live alias unique and unreused.
// Collisions only resolve by nonce, so the same sender and name always land
// on the same alias while any other combination moves on.
async function freshIndicator(linkId, senderKey, firstName) {
  for (let nonce = 0; nonce < 8; nonce += 1) {
    const label = await ids.makeIndicator(senderKey, firstName, nonce);
    const fp = await ids.aliasFp(label);
    const [live, retired] = await Promise.all([
      store.conversationFpInUse(linkId, fp),
      store.isRetiredAlias(fp),
    ]);
    if (!live && !retired) return { label, fp };
  }
  throw new Error('alias space exhausted');
}

async function ensureDelivery(link, ownerChat, senderKey, mode, firstName, senderId, now, owner = null) {
  const memoText = await linkMemo(link);
  const memo = ids.escapeHtml(memoText);
  const ownerRow = owner ?? await store.getOwner(link.owner_key);
  const lang = ownerRow?.lang ?? 'en';

  if (mode === 'anon') {
    const { thread, created, pending } = await ensureTopic(
      link,
      ownerChat,
      'anon',
      0,
      render.topicName('anon', memoText),
    );
    if (pending) return { pending: true };
    if (created && !thread) {
      await api.sendMessage({ chat_id: ownerChat, text: t(lang, 'topicsDisabled') });
    }
    return { kind: 'copy', thread, indicator: null, lang, header: `${EMOJI.anon} Anonymous · ${memo}` };
  }

  const conversation = await conversationFor(link, senderKey, mode, firstName, senderId, now);
  const label = await conversationLabel(link, conversation);
  const { thread, pending } = await ensureTopic(
    link,
    ownerChat,
    mode,
    conversation.id,
    render.topicName(mode, memoText, label),
  );
  if (pending) return { pending: true };
  if (thread && conversation.topic_id !== thread) {
    await store.setConversationTopic(conversation.id, thread);
  }
  await store.touchConversation(conversation.id, now);

  return {
    kind: mode === 'forward' ? 'forward' : 'copy',
    thread,
    conversation_id: conversation.id,
    indicator: label,
    lang,
    header: `${mode === 'history' ? EMOJI.history : EMOJI.forward} ${ids.escapeHtml(label)} · ${memo}`,
  };
}

// Alias label without sealing a job, so the UI can confirm success first.
// deliver() resolves the same row again; the label is identical.
export async function aliasFor(link, senderKey, firstName, senderId, now) {
  const conversation = await conversationFor(link, senderKey, 'history', firstName, senderId, now);
  return conversationLabel(link, conversation);
}

export async function deliver(link, senderId, senderKey, mode, messageIds, firstName, now, senderThread = 0, salt = null, owner = null, senderLang = 'en', confirm = null) {
  const ownerChat = await ownerChatId(link);
  const target = await ensureDelivery(link, ownerChat, senderKey, mode, firstName, senderId, now, owner);
  if (target.pending) return target;
  await sealJob(link, target.kind, {
    chat_id: ownerChat,
    thread_id: target.thread,
    conversation_id: target.conversation_id ?? 0,
    from_chat_id: senderId,
    message_ids: messageIds,
    mode,
    sender_key: senderKey,
    sender_thread_id: senderThread,
    global_key: await userKeyFor(senderId, salt),
    lang: target.lang,
    sender_lang: senderLang ?? 'en',
    header: target.header,
    ...(confirm ? { confirm_chat_id: confirm.chatId, confirm_message_id: confirm.messageId } : {}),
  }, now);
  return target;
}
