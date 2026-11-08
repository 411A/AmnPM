import { CONFIG } from './config.js';
import * as c from './crypto.js';
import * as store from './store.js';
import {
  actionKey,
  actionKeyVersions,
  contentKek,
  CURRENT_ACTION_VERSION,
} from './keyring.js';

export { actionKey } from './keyring.js';

export async function linkDek(link) {
  const kek = contentKek(link.kek_version);
  return c.decryptBytes(
    kek,
    link.dek_wrapped,
    link.dek_nonce,
    `link:${link.token_lookup}:dek:v1`,
  );
}

export async function linkToken(link) {
  const dek = await linkDek(link);
  return c.decrypt(dek, link.token_ct, link.token_nonce, `link:${link.token_lookup}:token:v1`);
}

export async function linkMemo(link) {
  if (!link.memo?.startsWith('enc:')) {
    if (!link.memo) return '';
    const dek = await linkDek(link);
    const sealed = await c.encrypt(dek, link.memo, `link:${link.token_lookup}:memo:v1`);
    await store.setLinkMemo(link.id, `enc:${sealed.nonce}:${sealed.ct}`);
    return link.memo;
  }
  const dek = await linkDek(link);
  const [, nonce, ct] = link.memo.split(':');
  return c.decrypt(dek, ct, nonce, `link:${link.token_lookup}:memo:v1`);
}

export async function sealTopicName(link, topicId, name) {
  const dek = await linkDek(link);
  const sealed = await c.encrypt(dek, name, `topic:${topicId}:name:v1`);
  return `enc:${sealed.nonce}:${sealed.ct}`;
}

export async function topicLabel(link, topic) {
  if (!topic.name?.startsWith('enc:')) return '';
  const dek = await linkDek(link);
  const [, nonce, ct] = topic.name.split(':');
  return c.decrypt(dek, ct, nonce, `topic:${topic.id}:name:v1`);
}

export async function sealConversationChat(link, chatId, senderKey, mode) {
  const dek = await linkDek(link);
  const sealed = await c.encrypt(
    dek,
    String(chatId),
    `conversation:${link.id}:${senderKey}:${mode}:chat:v1`,
  );
  return `enc:${sealed.nonce}:${sealed.ct}`;
}

export async function conversationChatId(link, conversation) {
  if (!conversation.sender_chat_ct?.startsWith('enc:')) return 0;
  const dek = await linkDek(link);
  const [, nonce, ct] = conversation.sender_chat_ct.split(':');
  return Number(await c.decrypt(
    dek,
    ct,
    nonce,
    `conversation:${link.id}:${conversation.sender_key}:${conversation.mode}:chat:v1`,
  ));
}

export async function sealConversationLabel(link, label, senderKey, mode) {
  const dek = await linkDek(link);
  const sealed = await c.encrypt(
    dek,
    label,
    `conversation:${link.id}:${senderKey}:${mode}:v1`,
  );
  return `enc:${sealed.nonce}:${sealed.ct}`;
}

export async function conversationLabel(link, conversation) {
  if (!conversation.indicator?.startsWith('enc:')) {
    if (!conversation.indicator) return '';
    const dek = await linkDek(link);
    const sealed = await c.encrypt(
      dek,
      conversation.indicator,
      `conversation:${conversation.link_id}:${conversation.sender_key}:${conversation.mode}:v1`,
    );
    await store.setConversationIndicator(conversation.id, `enc:${sealed.nonce}:${sealed.ct}`);
    return conversation.indicator;
  }
  const dek = await linkDek(link);
  const [, nonce, ct] = conversation.indicator.split(':');
  return c.decrypt(
    dek,
    ct,
    nonce,
    `conversation:${conversation.link_id}:${conversation.sender_key}:${conversation.mode}:v1`,
  );
}

export async function ownerChatId(link) {
  const dek = await linkDek(link);
  return Number(
    await c.decrypt(dek, link.owner_chat_ct, link.owner_chat_nonce, `link:${link.token_lookup}:owner_chat:v1`),
  );
}

async function prepareAction(link, kind, payload, now, ttl, key) {
  const actionKeyBytes = key ?? (await actionKey(link));
  const { ct, nonce } = await c.encrypt(
    actionKeyBytes,
    JSON.stringify(payload),
    `link:${link.id}:action:${kind}:v1`,
  );
  const parts = c.split(ct);
  return {
    row: {
      prefix: parts.prefix,
      body: parts.body,
      nonce,
      link_id: link.id,
      kind,
      expires_at: now + ttl,
    },
    prefix: parts.prefix,
    suffix: parts.suffix,
  };
}

export async function sealAction(link, kind, payload, now, ttl = CONFIG.actionTtlSeconds, key = null) {
  const prepared = await prepareAction(link, kind, payload, now, ttl, key);
  await store.putActionToken(prepared.row);
  return { prefix: prepared.prefix, suffix: prepared.suffix };
}

export async function sealActions(link, specs, now, ttl = CONFIG.actionTtlSeconds, key = null) {
  const actionKeyBytes = key ?? (await actionKey(link));
  const prepared = await Promise.all(
    specs.map(({ kind, payload }) => prepareAction(link, kind, payload, now, ttl, actionKeyBytes)),
  );
  await store.putActionTokens(prepared.map((item) => item.row));
  return prepared.map(({ prefix, suffix }) => ({ prefix, suffix }));
}

export async function openAction(prefix, suffix) {
  const row = await store.getActionToken(prefix);
  if (!row) return null;
  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    await store.deleteActionToken(prefix);
    return null;
  }
  const link = await store.getLink(row.link_id);
  if (!link || link.state !== 'active') {
    await store.deleteActionToken(prefix);
    return null;
  }
  const ct = c.join(row.body, suffix);
  const aad = `link:${link.id}:action:${row.kind}:v1`;
  let text;
  for (const version of actionKeyVersions()) {
    try {
      text = await c.decrypt(await actionKey(link, version), ct, row.nonce, aad);
      break;
    } catch {
      // this version did not seal the token
    }
  }
  if (text === undefined) {
    // Tokens sealed before the action-key domain used the link DEK. They stay
    // readable until their normal TTL; new tokens never use this path.
    try {
      text = await c.decrypt(await linkDek(link), ct, row.nonce, aad);
    } catch {
      return null;
    }
  }
  return { row, link, payload: JSON.parse(text) };
}

// Reply windows persist an encrypted sender target for the owner's next
// message. Use the action domain for new windows; old rows fall back to the
// link DEK and expire on their normal schedule.
export async function sealReplyTarget(link, target) {
  const key = await actionKey(link, CURRENT_ACTION_VERSION);
  const sealed = await c.encrypt(
    key,
    JSON.stringify(target),
    `link:${link.id}:reply:v1`,
  );
  return { ct: sealed.ct, nonce: sealed.nonce };
}

export async function openReplyTarget(link, ct, nonce) {
  const aad = `link:${link.id}:reply:v1`;
  for (const version of actionKeyVersions()) {
    try {
      return JSON.parse(await c.decrypt(await actionKey(link, version), ct, nonce, aad));
    } catch {
      // try the next action key version
    }
  }
  try {
    return JSON.parse(await c.decrypt(await linkDek(link), ct, nonce, aad));
  } catch {
    return null;
  }
}

export async function sealJob(link, kind, payload, now) {
  const dek = await linkDek(link);
  const { ct, nonce } = await c.encrypt(dek, JSON.stringify(payload), `link:${link.id}:job:v1`);
  return store.enqueueJob({
    link_id: link.id,
    kind,
    payload_ct: ct,
    payload_nonce: nonce,
    next_at: now,
    created_at: now,
  });
}

export async function openJob(job) {
  const link = await store.getLink(job.link_id);
  if (!link) return null;
  const dek = await linkDek(link);
  const text = await c.decrypt(dek, job.payload_ct, job.payload_nonce, `link:${job.link_id}:job:v1`);
  return { link, payload: JSON.parse(text) };
}
