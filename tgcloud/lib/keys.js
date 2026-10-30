import { CONFIG } from './config.js';
import * as c from './crypto.js';
import * as store from './store.js';
import { KEYS } from './secret.js';

export async function linkDek(link) {
  const kek = KEYS[link.kek_version];
  if (!kek) throw new Error(`unknown KEK version ${link.kek_version}`);
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

export async function sealAction(link, kind, payload, now, ttl = CONFIG.actionTtlSeconds) {
  const dek = await linkDek(link);
  const { ct, nonce } = await c.encrypt(
    dek,
    JSON.stringify(payload),
    `link:${link.id}:action:${kind}:v1`,
  );
  const parts = c.split(ct);
  await store.putActionToken({
    prefix: parts.prefix,
    body: parts.body,
    nonce,
    link_id: link.id,
    kind,
    expires_at: now + ttl,
  });
  return { prefix: parts.prefix, suffix: parts.suffix };
}

export async function openAction(prefix, suffix) {
  const row = await store.getActionToken(prefix);
  if (!row) return null;
  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    await store.deleteActionToken(prefix);
    return null;
  }
  const link = await store.getLink(row.link_id);
  if (!link) {
    await store.deleteActionToken(prefix);
    return null;
  }
  const dek = await linkDek(link);
  const text = await c.decrypt(
    dek,
    c.join(row.body, suffix),
    row.nonce,
    `link:${link.id}:action:${row.kind}:v1`,
  );
  return { row, link, payload: JSON.parse(text) };
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
