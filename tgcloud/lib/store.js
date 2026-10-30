import { db } from 'sdk';
import { sql } from 'sdk/db';
import { randomHex } from './crypto.js';

export async function getMeta(key) {
  const row = await db.get(sql`SELECT v FROM meta WHERE k = ${key}`);
  return row?.v;
}

export async function setMeta(key, value) {
  await db.run(sql`INSERT INTO meta (k, v) VALUES (${key}, ${value})
    ON CONFLICT(k) DO UPDATE SET v = excluded.v`);
}

export async function setLinkSalt(id, salt) {
  await db.run(sql`UPDATE links SET salt = ${salt} WHERE id = ${id}`);
}

export async function ensureOwner(ownerKey, now, lang = 'en') {
  let created = false;
  try {
    await db.run(sql`INSERT INTO owners (owner_key, lang, created_at)
      VALUES (${ownerKey}, ${lang}, ${now})`);
    created = true;
  } catch (err) {
    if (!/unique|constraint/i.test(String(err))) throw err;
  }
  await db.run(sql`UPDATE owners SET lang = ${lang} WHERE owner_key = ${ownerKey}`);
  return created;
}

export async function getOwner(ownerKey) {
  return db.get(sql`SELECT * FROM owners WHERE owner_key = ${ownerKey}`);
}

export async function claimSlot(ownerKey, cap, now) {
  // Recover slots left by a crashed insert older than one hour.
  await db.run(sql`DELETE FROM link_slots
    WHERE owner_key = ${ownerKey} AND created_at < ${now - 3600}
      AND NOT EXISTS (SELECT 1 FROM links
        WHERE links.owner_key = link_slots.owner_key
          AND links.slot = link_slots.slot AND links.state = 'active')`);
  for (let slot = 0; slot < cap; slot += 1) {
    try {
      await db.run(sql`INSERT INTO link_slots (owner_key, slot, created_at)
        VALUES (${ownerKey}, ${slot}, ${now})`);
      return slot;
    } catch (err) {
      if (!/unique|constraint/i.test(String(err))) throw err;
    }
  }
  return null;
}

export async function releaseSlot(ownerKey, slot) {
  await db.run(sql`DELETE FROM link_slots WHERE owner_key = ${ownerKey} AND slot = ${slot}`);
}

export async function insertLink(link) {
  await db.run(sql`INSERT INTO links
    (token, memo, slot, owner_key, owner_chat_ct, owner_chat_nonce, salt, dek_wrapped, dek_nonce,
     kek_version, state, created_at)
    VALUES (${link.token}, ${link.memo}, ${link.slot}, ${link.owner_key}, ${link.owner_chat_ct},
      ${link.owner_chat_nonce}, ${link.salt}, ${link.dek_wrapped}, ${link.dek_nonce},
      ${link.kek_version}, 'active', ${link.created_at})`);
  return findLinkByToken(link.token);
}

export async function findLinkByToken(token) {
  return db.get(sql`SELECT * FROM links WHERE token = ${token}`);
}

export async function getLink(id) {
  return db.get(sql`SELECT * FROM links WHERE id = ${id}`);
}

export async function listLinks(ownerKey) {
  return db.all(sql`SELECT * FROM links WHERE owner_key = ${ownerKey} AND state = 'active'
    ORDER BY id DESC`);
}

export async function updateMemo(id, memo) {
  await db.run(sql`UPDATE links SET memo = ${memo} WHERE id = ${id}`);
}

export async function setLinkMemo(id, memo) {
  await db.run(sql`UPDATE links SET memo = ${memo} WHERE id = ${id}`);
}

export async function setConversationIndicator(id, indicator) {
  await db.run(sql`UPDATE conversations SET indicator = ${indicator} WHERE id = ${id}`);
}

export async function revokeLink(id, now) {
  await db.run(sql`UPDATE links SET state = 'revoked', revoked_at = ${now} WHERE id = ${id}`);
}

export async function insertRetired(fingerprint, now) {
  await db.run(sql`INSERT OR IGNORE INTO retired_tokens (token_fp, retired_at)
    VALUES (${fingerprint}, ${now})`);
}

export async function isRetired(fingerprint) {
  return Boolean(await db.get(sql`SELECT 1 AS hit FROM retired_tokens WHERE token_fp = ${fingerprint}`));
}

export async function upsertSession(userKey, linkId, now) {
  await db.run(sql`INSERT INTO sessions (user_key, link_id, mode, updated_at)
    VALUES (${userKey}, ${linkId}, NULL, ${now})
    ON CONFLICT(user_key) DO UPDATE SET
      link_id = excluded.link_id, mode = NULL, updated_at = excluded.updated_at`);
}

export async function getSession(userKey) {
  return db.get(sql`SELECT * FROM sessions WHERE user_key = ${userKey}`);
}

export async function setSessionMode(userKey, mode, now) {
  await db.run(sql`UPDATE sessions SET mode = ${mode}, updated_at = ${now} WHERE user_key = ${userKey}`);
}

export async function addPending(row) {
  const existing = await db.get(sql`SELECT 1 AS hit FROM pending
    WHERE user_key = ${row.user_key} AND group_key = ${row.group_key}
      AND message_id = ${row.message_id}`);
  await db.run(sql`INSERT OR IGNORE INTO pending
    (user_key, link_id, group_key, message_id, created_at)
    VALUES (${row.user_key}, ${row.link_id}, ${row.group_key}, ${row.message_id}, ${row.created_at})`);
  return !existing;
}

export async function listPending(userKey, groupKey) {
  return db.all(sql`SELECT message_id FROM pending
    WHERE user_key = ${userKey} AND group_key = ${groupKey} ORDER BY message_id`);
}

export async function clearPending(userKey, groupKey) {
  await db.run(sql`DELETE FROM pending WHERE user_key = ${userKey} AND group_key = ${groupKey}`);
}

export async function sweepPending(cutoff) {
  await db.run(sql`DELETE FROM pending WHERE created_at <= ${cutoff}`);
}

export async function setMemoState(ownerKey, linkId) {
  await db.run(sql`UPDATE owners SET memo_link_id = ${linkId} WHERE owner_key = ${ownerKey}`);
}

export async function getMemoState(ownerKey) {
  const row = await db.get(sql`SELECT memo_link_id FROM owners WHERE owner_key = ${ownerKey}`);
  return row?.memo_link_id ?? null;
}

export async function clearMemoState(ownerKey) {
  await db.run(sql`UPDATE owners SET memo_link_id = NULL WHERE owner_key = ${ownerKey}`);
}

export async function deleteSession(userKey) {
  await db.run(sql`DELETE FROM sessions WHERE user_key = ${userKey}`);
}

export async function getConversation(linkId, senderKey, mode) {
  return db.get(sql`SELECT * FROM conversations
    WHERE link_id = ${linkId} AND sender_key = ${senderKey} AND mode = ${mode}`);
}

export async function createConversation(row) {
  const result = await db.run(sql`INSERT INTO conversations
    (link_id, sender_key, mode, indicator, topic_id, created_at, last_at)
    VALUES (${row.link_id}, ${row.sender_key}, ${row.mode}, ${row.indicator ?? null},
      ${row.topic_id ?? 0}, ${row.created_at}, ${row.last_at})`);
  return result.lastInsertRowid;
}

export async function touchConversation(id, now) {
  await db.run(sql`UPDATE conversations SET last_at = ${now} WHERE id = ${id}`);
}

export async function setConversationTopic(id, topicId) {
  await db.run(sql`UPDATE conversations SET topic_id = ${topicId} WHERE id = ${id}`);
}

export async function getConversationById(id) {
  return db.get(sql`SELECT * FROM conversations WHERE id = ${id}`);
}

export async function getTopic(linkId, kind, conversationId) {
  return db.get(sql`SELECT * FROM topics
    WHERE link_id = ${linkId} AND kind = ${kind} AND conversation_id = ${conversationId}`);
}

export async function createTopic(row) {
  const result = await db.run(sql`INSERT INTO topics
    (link_id, kind, conversation_id, thread_id, name, state)
    VALUES (${row.link_id}, ${row.kind}, ${row.conversation_id}, ${row.thread_id}, ${row.name},
      ${row.state})`);
  return result.lastInsertRowid;
}

export async function updateTopic(id, threadId, name, state) {
  await db.run(sql`UPDATE topics SET thread_id = ${threadId}, name = ${name}, state = ${state}
    WHERE id = ${id}`);
}

export async function listTopics(linkId) {
  return db.all(sql`SELECT * FROM topics WHERE link_id = ${linkId}`);
}

export async function countTopicsNamed(linkId, name) {
  const row = await db.get(sql`SELECT COUNT(*) AS n FROM topics WHERE link_id = ${linkId} AND name = ${name}`);
  return Number(row?.n ?? 0);
}

export async function getSenderTopic(linkId, senderKey) {
  return db.get(sql`SELECT * FROM sender_topics
    WHERE link_id = ${linkId} AND sender_key = ${senderKey}`);
}

export async function createSenderTopic(row) {
  await db.run(sql`INSERT INTO sender_topics
    (link_id, sender_key, thread_id, name, state, created_at)
    VALUES (${row.link_id}, ${row.sender_key}, ${row.thread_id}, ${row.name}, ${row.state},
      ${row.created_at})`);
  return getSenderTopic(row.link_id, row.sender_key);
}

export async function updateSenderTopic(id, threadId, name, state) {
  await db.run(sql`UPDATE sender_topics SET thread_id = ${threadId}, name = ${name}, state = ${state}
    WHERE id = ${id}`);
}

export async function hasBlock(ownerKey, linkId, senderKey) {
  const row = await db.get(sql`SELECT 1 AS hit FROM blocks
    WHERE owner_key = ${ownerKey} AND link_id = ${linkId} AND sender_key = ${senderKey}`);
  return Boolean(row);
}

export async function isBlocked(ownerKey, linkId, senderKey) {
  const row = await db.get(sql`SELECT 1 AS hit FROM blocks
    WHERE owner_key = ${ownerKey} AND sender_key = ${senderKey}
      AND (link_id = 0 OR link_id = ${linkId})`);
  return Boolean(row);
}

export async function setBlock(ownerKey, linkId, senderKey, now) {
  await db.run(sql`INSERT OR IGNORE INTO blocks (owner_key, link_id, sender_key, created_at)
    VALUES (${ownerKey}, ${linkId}, ${senderKey}, ${now})`);
}

export async function clearBlock(ownerKey, linkId, senderKey) {
  await db.run(sql`DELETE FROM blocks
    WHERE owner_key = ${ownerKey} AND link_id = ${linkId} AND sender_key = ${senderKey}`);
}

export async function putActionToken(row) {
  await db.run(sql`INSERT INTO action_tokens (prefix, body, nonce, link_id, kind, expires_at)
    VALUES (${row.prefix}, ${row.body}, ${row.nonce}, ${row.link_id}, ${row.kind}, ${row.expires_at})`);
}

export async function getActionToken(prefix) {
  return db.get(sql`SELECT * FROM action_tokens WHERE prefix = ${prefix}`);
}

export async function deleteActionToken(prefix) {
  await db.run(sql`DELETE FROM action_tokens WHERE prefix = ${prefix}`);
}

export async function deleteActionTokens(linkId, kind) {
  await db.run(sql`DELETE FROM action_tokens WHERE link_id = ${linkId} AND kind = ${kind}`);
}

export async function sweepActionTokens(now) {
  await db.run(sql`DELETE FROM action_tokens WHERE expires_at <= ${now}`);
}

export async function enqueueJob(row) {
  const result = await db.run(sql`INSERT INTO jobs
    (link_id, kind, payload_ct, payload_nonce, state, attempts, next_at, created_at)
    VALUES (${row.link_id}, ${row.kind}, ${row.payload_ct}, ${row.payload_nonce}, 'pending', 0,
      ${row.next_at}, ${row.created_at})`);
  return result.lastInsertRowid;
}

export async function claimJob(now) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await db.get(sql`SELECT id FROM jobs
      WHERE state = 'pending' AND next_at <= ${now} ORDER BY id LIMIT 1`);
    if (!row) return undefined;
    const claim = randomHex(8);
    await db.run(sql`UPDATE jobs SET state = 'sending', claim = ${claim}
      WHERE id = ${row.id} AND state = 'pending'`);
    const claimed = await db.get(sql`SELECT id, link_id, kind, payload_ct, payload_nonce, attempts
      FROM jobs WHERE id = ${row.id} AND state = 'sending' AND claim = ${claim}`);
    if (claimed) return claimed;
  }
  return undefined;
}

export async function finishJob(id) {
  await db.run(sql`DELETE FROM jobs WHERE id = ${id}`);
}

export async function retryJob(id, nextAt) {
  await db.run(sql`UPDATE jobs SET state = 'pending', claim = NULL, attempts = attempts + 1,
    next_at = ${nextAt} WHERE id = ${id}`);
}

export async function failJob(id) {
  await db.run(sql`UPDATE jobs SET state = 'failed', claim = NULL, attempts = attempts + 1
    WHERE id = ${id}`);
}

export async function bumpRate(linkId, senderKey, now) {
  const cutoff = now - 60;
  await db.run(sql`INSERT INTO rate_limits (link_id, sender_key, window_start, count)
    VALUES (${linkId}, ${senderKey}, ${now}, 1)
    ON CONFLICT(link_id, sender_key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${cutoff} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${cutoff} THEN ${now}
        ELSE rate_limits.window_start END`);
  const row = await db.get(sql`SELECT count FROM rate_limits
    WHERE link_id = ${linkId} AND sender_key = ${senderKey}`);
  return Number(row?.count ?? 0);
}

export async function openReplyWindow(row) {
  await db.run(sql`INSERT INTO reply_windows
    (owner_key, link_id, target_ct, target_nonce, original_id, expires_at)
    VALUES (${row.owner_key}, ${row.link_id}, ${row.target_ct}, ${row.target_nonce},
      ${row.original_id}, ${row.expires_at})
    ON CONFLICT(owner_key) DO UPDATE SET
      link_id = excluded.link_id, target_ct = excluded.target_ct,
      target_nonce = excluded.target_nonce, original_id = excluded.original_id,
      expires_at = excluded.expires_at`);
}

export async function getReplyWindow(ownerKey, now) {
  const row = await db.get(sql`SELECT * FROM reply_windows WHERE owner_key = ${ownerKey}`);
  if (!row) return null;
  if (row.expires_at <= now) {
    await db.run(sql`DELETE FROM reply_windows WHERE owner_key = ${ownerKey}`);
    return null;
  }
  return row;
}

export async function closeReplyWindow(ownerKey) {
  await db.run(sql`DELETE FROM reply_windows WHERE owner_key = ${ownerKey}`);
}

const LINK_TABLES = {
  jobs: 'jobs',
  actions: 'action_tokens',
  rates: 'rate_limits',
  blocks: 'blocks',
  topics: 'topics',
  sender_topics: 'sender_topics',
  conversations: 'conversations',
  pending: 'pending',
  sessions: 'sessions',
  replies: 'reply_windows',
};

export async function deleteLinkScoped(linkId) {
  const counts = {};
  for (const [name, table] of Object.entries(LINK_TABLES)) {
    const row = await db.get(sql`SELECT COUNT(*) AS n FROM ${sql.raw(table)} WHERE link_id = ${linkId}`);
    counts[name] = Number(row?.n ?? 0);
    await db.run(sql`DELETE FROM ${sql.raw(table)} WHERE link_id = ${linkId}`);
  }
  return counts;
}

export async function deleteLinkRow(linkId) {
  return (await db.run(sql`DELETE FROM links WHERE id = ${linkId}`)).changes;
}

export async function countLinkRows(linkId) {
  const tables = ['jobs', 'action_tokens', 'rate_limits', 'blocks', 'topics', 'sender_topics', 'conversations', 'pending', 'sessions', 'reply_windows'];
  const counts = {};
  for (const table of tables) {
    const row = await db.get(sql`SELECT COUNT(*) AS n FROM ${sql.raw(table)} WHERE link_id = ${linkId}`);
    counts[table] = Number(row?.n ?? 0);
  }
  counts.links = Number((await db.get(sql`SELECT COUNT(*) AS n FROM links WHERE id = ${linkId}`))?.n ?? 0);
  return counts;
}
