import { api } from 'sdk';
import * as store from './store.js';
import * as ids from './ids.js';
import { linkMemo, linkToken } from './keys.js';
import { closeLinkTopics } from './topics.js';

// The one destructive path used by both /revoke and retention. Callers must
// claim the link first (active -> purging) so two workers cannot purge twice.
// Retention disables the per-topic notice so an idle chat is not resurrected.
export async function purgeLink(link, chat, lang, now, notifyTopics = true) {
  let token = '';
  try {
    token = await linkToken(link);
  } catch {
    // An unreadable token must not block deleting the rest of the row.
  }
  let memo = '';
  try {
    memo = await linkMemo(link);
  } catch {
    // Topic names fall back to kind-only names when the memo is unreadable.
  }

  const memoState = await store.getMemoState(link.owner_key);
  const replyState = await store.getReplyWindow(link.owner_key, now);
  if (memoState?.memo_link_id === link.id && memoState.memo_message_id) {
    try {
      await api.deleteMessage({ chat_id: chat, message_id: memoState.memo_message_id });
    } catch {
      // already gone
    }
  }
  if (replyState?.link_id === link.id && replyState.prompt_message_id) {
    try {
      await api.deleteMessage({ chat_id: chat, message_id: replyState.prompt_message_id });
    } catch {
      // already gone
    }
  }

  if (chat) {
    try {
      await closeLinkTopics(link, chat, lang, notifyTopics);
    } catch {
      // The stored data still has to go even if Telegram refuses the close.
    }
  }

  if (token) await store.insertRetired(await ids.tokenFp(token), now);
  await store.retireLinkAliases(link.id, now);
  await store.deleteLinkScoped(link.id);
  await store.deleteLinkRow(link.id);
  await store.releaseSlot(link.owner_key, link.slot);
  if (memoState?.memo_link_id === link.id) await store.clearMemoState(link.owner_key);
  return { token, memo };
}
