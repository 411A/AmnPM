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

export async function insertMetaIfAbsent(key, value) {
  const result = await db.run(sql`INSERT INTO meta (k, v) VALUES (${key}, ${value})
    ON CONFLICT(k) DO NOTHING`);
  return (result.rowsAffected ?? result.changes) > 0;
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

export async function setOwnerModes(ownerKey, modes) {
  await db.run(sql`UPDATE owners SET modes = ${modes.join(',')} WHERE owner_key = ${ownerKey}`);
}

// One read covers the memo prompt, the reply window, and owner detection.
export async function getOwnerState(ownerKey) {
  return db.get(sql`SELECT o.owner_key, o.memo_link_id, o.memo_message_id,
      r.link_id AS reply_link_id, r.target_ct, r.target_nonce,
      r.thread_id AS reply_thread_id, r.prompt_message_id AS reply_prompt_id,
      r.original_id, r.expires_at
    FROM owners o
    LEFT JOIN reply_windows r ON r.owner_key = o.owner_key
    WHERE o.owner_key = ${ownerKey}`);
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
    (token_lookup, token_ct, token_nonce, memo, slot, owner_key, owner_chat_ct, owner_chat_nonce,
     dek_wrapped, dek_nonce, kek_version, state, created_at)
    VALUES (${link.token_lookup}, ${link.token_ct}, ${link.token_nonce}, ${link.memo},
      ${link.slot}, ${link.owner_key}, ${link.owner_chat_ct}, ${link.owner_chat_nonce},
      ${link.dek_wrapped}, ${link.dek_nonce},
      ${link.kek_version}, 'active', ${link.created_at})`);
  return findLinkByLookup(link.token_lookup);
}

export async function findLinkByLookup(lookup) {
  return db.get(sql`SELECT * FROM links WHERE token_lookup = ${lookup}`);
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

export async function setLinkState(id, state) {
  await db.run(sql`UPDATE links SET state = ${state} WHERE id = ${id}`);
}

export async function setLinkMemo(id, memo) {
  await db.run(sql`UPDATE links SET memo = ${memo} WHERE id = ${id}`);
}

export async function setConversationIndicator(id, indicator) {
  await db.run(sql`UPDATE conversations SET indicator = ${indicator} WHERE id = ${id}`);
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

// Session and link in one read for the common non-topic message path.
export async function getSessionWithLink(userKey) {
  return db.get(sql`SELECT l.*, s.mode AS session_mode FROM sessions s
    JOIN links l ON l.id = s.link_id WHERE s.user_key = ${userKey}`);
}

export async function setSessionMode(userKey, mode, now) {
  await db.run(sql`UPDATE sessions SET mode = ${mode}, updated_at = ${now} WHERE user_key = ${userKey}`);
}

export async function addPending(row) {
  // The unique index makes the insert itself the duplicate check. One statement
  // per message instead of a SELECT followed by a write. Return the inserted row
  // id so callers can tell duplicate inserts apart from new ones.
  const result = await db.run(sql`INSERT OR IGNORE INTO pending
    (user_key, link_id, group_key, message_id, created_at)
    VALUES (${row.user_key}, ${row.link_id}, ${row.group_key}, ${row.message_id}, ${row.created_at})
    RETURNING id`);
  return Number(result.rows?.[0]?.id ?? 0);
}

// The earliest inserted pending row for a group is the sole asker, even when
// every album item landed before the first handler ran.
export async function isFirstPending(userKey, groupKey, messageId) {
  const first = await db.get(sql`SELECT message_id FROM pending
    WHERE user_key = ${userKey} AND group_key = ${groupKey}
    ORDER BY id LIMIT 1`);
  return first ? Number(first.message_id) === Number(messageId) : false;
}

// Atomically remove and return a group's message ids in delivery order. One
// statement, so a concurrent insert either joins this batch or starts the
// next one; a row is never listed-but-lost or delivered twice.
export async function takePending(userKey, groupKey) {
  const result = await db.run(sql`DELETE FROM pending
    WHERE user_key = ${userKey} AND group_key = ${groupKey}
    RETURNING message_id`);
  return (result.rows ?? []).map((row) => Number(row.message_id)).sort((a, b) => a - b);
}

// First caller wins the group; a concurrent second tap gets no rows.
export async function claimPending(userKey, groupKey) {
  const result = await db.run(sql`UPDATE pending SET claimed = 1
    WHERE user_key = ${userKey} AND group_key = ${groupKey} AND claimed = 0`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function releasePending(userKey, groupKey) {
  await db.run(sql`UPDATE pending SET claimed = 0
    WHERE user_key = ${userKey} AND group_key = ${groupKey}`);
}

export async function clearPending(userKey, groupKey) {
  await db.run(sql`DELETE FROM pending WHERE user_key = ${userKey} AND group_key = ${groupKey}`);
}

export async function sweepPending(cutoff) {
  await db.run(sql`DELETE FROM pending WHERE created_at <= ${cutoff}`);
}

// The memo prompt and the reply window are mutually exclusive. Each claim is a
// single statement, so two concurrent owner actions cannot both win.
export async function claimMemo(ownerKey, linkId) {
  const result = await db.run(sql`UPDATE owners SET memo_link_id = ${linkId}, memo_message_id = 0
    WHERE owner_key = ${ownerKey}
      AND NOT EXISTS (SELECT 1 FROM reply_windows WHERE owner_key = ${ownerKey})`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function setMemoMessageId(ownerKey, messageId) {
  await db.run(sql`UPDATE owners SET memo_message_id = ${messageId}
    WHERE owner_key = ${ownerKey} AND memo_link_id IS NOT NULL`);
}

export async function getMemoState(ownerKey) {
  const row = await db.get(sql`SELECT memo_link_id, memo_message_id FROM owners
    WHERE owner_key = ${ownerKey}`);
  return row?.memo_link_id ? row : null;
}

export async function clearMemoState(ownerKey) {
  await db.run(sql`UPDATE owners SET memo_link_id = NULL, memo_message_id = NULL
    WHERE owner_key = ${ownerKey}`);
}

export async function deleteSession(userKey) {
  await db.run(sql`DELETE FROM sessions WHERE user_key = ${userKey}`);
}

export async function getConversation(linkId, senderKey, mode) {
  return db.get(sql`SELECT * FROM conversations
    WHERE link_id = ${linkId} AND sender_key = ${senderKey} AND mode = ${mode}`);
}

export async function createConversation(row) {
  const result = await db.run(sql`INSERT OR IGNORE INTO conversations
    (link_id, sender_key, mode, indicator, indicator_fp, sender_chat_ct, last_message_id, topic_id, created_at, last_at)
    VALUES (${row.link_id}, ${row.sender_key}, ${row.mode}, ${row.indicator ?? null}, ${row.indicator_fp ?? null},
      ${row.sender_chat_ct ?? null}, ${row.last_message_id ?? 0}, ${row.topic_id ?? 0},
      ${row.created_at}, ${row.last_at})`);
  return result.lastInsertRowid;
}

export async function conversationFpInUse(linkId, fp) {
  const row = await db.get(sql`SELECT 1 AS hit FROM conversations
    WHERE link_id = ${linkId} AND indicator_fp = ${fp}`);
  return Boolean(row);
}

export async function insertRetiredAlias(fp, now) {
  await db.run(sql`INSERT OR IGNORE INTO retired_aliases (alias_fp, retired_at)
    VALUES (${fp}, ${now})`);
}

export async function isRetiredAlias(fp) {
  return Boolean(await db.get(sql`SELECT 1 AS hit FROM retired_aliases WHERE alias_fp = ${fp}`));
}

// Retired aliases never return: record a link's fingerprints before its
// conversation rows are deleted, like retired_tokens does for link tokens.
export async function retireLinkAliases(linkId, now) {
  await db.run(sql`INSERT OR IGNORE INTO retired_aliases (alias_fp, retired_at)
    SELECT DISTINCT indicator_fp, ${now} FROM conversations
    WHERE link_id = ${linkId} AND indicator_fp IS NOT NULL`);
}

export async function setConversationChat(id, sealed) {
  await db.run(sql`UPDATE conversations SET sender_chat_ct = ${sealed} WHERE id = ${id}`);
}

export async function setConversationLastMessage(id, messageId) {
  await db.run(sql`UPDATE conversations SET last_message_id = ${messageId}
    WHERE id = ${id} AND last_message_id < ${messageId}`);
}

export async function markConversationSetupPrompted(id) {
  const result = await db.run(sql`UPDATE conversations SET setup_prompted = 1
    WHERE id = ${id} AND setup_prompted = 0`);
  return (result.rowsAffected ?? result.changes) > 0;
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

export async function getOwnedTopicByThread(ownerKey, threadId) {
  return db.get(sql`SELECT t.* FROM topics t JOIN links l ON l.id = t.link_id
    WHERE t.thread_id = ${threadId} AND l.owner_key = ${ownerKey}`);
}

export async function createTopic(row) {
  const result = await db.run(sql`INSERT INTO topics
    (link_id, kind, conversation_id, thread_id, name, state, created_at)
    VALUES (${row.link_id}, ${row.kind}, ${row.conversation_id}, ${row.thread_id}, ${row.name},
      ${row.state}, ${row.created_at ?? 0})`);
  return result.lastInsertRowid;
}

// Reserve the unique (link, kind, conversation) slot before calling Telegram,
// so two concurrent deliveries cannot create two topics for one conversation.
export async function reserveTopic(row) {
  const result = await db.run(sql`INSERT INTO topics
    (link_id, kind, conversation_id, thread_id, name, state, created_at)
    VALUES (${row.link_id}, ${row.kind}, ${row.conversation_id}, 0, '', 'creating', ${row.created_at})
    ON CONFLICT(link_id, kind, conversation_id) DO NOTHING`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function updateTopicState(id, threadId, state) {
  await db.run(sql`UPDATE topics SET thread_id = ${threadId}, state = ${state} WHERE id = ${id}`);
}

export async function takeStaleTopic(id, cutoff, now) {
  const result = await db.run(sql`UPDATE topics SET created_at = ${now}
    WHERE id = ${id} AND state = 'creating' AND created_at <= ${cutoff}`);
  return (result.rowsAffected ?? result.changes) > 0;
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

export async function getSenderTopicsByThread(threadId) {
  return db.all(sql`SELECT * FROM sender_topics WHERE thread_id = ${threadId}`);
}

export async function createSenderTopic(row) {
  await db.run(sql`INSERT INTO sender_topics
    (link_id, sender_key, thread_id, name, state, created_at)
    VALUES (${row.link_id}, ${row.sender_key}, ${row.thread_id}, ${row.name}, ${row.state},
      ${row.created_at})`);
  return getSenderTopic(row.link_id, row.sender_key);
}

export async function reserveSenderTopic(row) {
  const result = await db.run(sql`INSERT INTO sender_topics
    (link_id, sender_key, thread_id, name, state, created_at)
    VALUES (${row.link_id}, ${row.sender_key}, 0, '', 'creating', ${row.created_at})
    ON CONFLICT(link_id, sender_key) DO NOTHING`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function updateSenderTopic(id, threadId, state) {
  await db.run(sql`UPDATE sender_topics SET thread_id = ${threadId}, state = ${state}
    WHERE id = ${id}`);
}

export async function beginSenderRecreate(id, threadId, now) {
  const result = await db.run(sql`UPDATE sender_topics
    SET thread_id = 0, state = 'creating', created_at = ${now}
    WHERE id = ${id} AND thread_id = ${threadId} AND state = 'open'`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function beginTopicRecreate(id, threadId, now) {
  const result = await db.run(sql`UPDATE topics
    SET thread_id = 0, state = 'creating', created_at = ${now}
    WHERE id = ${id} AND thread_id = ${threadId} AND state = 'open'`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function takeStaleSenderTopic(id, cutoff, now) {
  const result = await db.run(sql`UPDATE sender_topics SET created_at = ${now}
    WHERE id = ${id} AND state = 'creating' AND created_at <= ${cutoff}`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function retrySenderTopic(id, now) {
  const result = await db.run(sql`UPDATE sender_topics SET state = 'creating', created_at = ${now}
    WHERE id = ${id} AND state = 'unavailable'`);
  return (result.rowsAffected ?? result.changes) > 0;
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

// Link-scope row uses the per-link key; global row uses the chat-wide key.
export async function isBlockedBy(ownerKey, linkId, linkSenderKey, globalSenderKey) {
  const row = await db.get(sql`SELECT 1 AS hit FROM blocks
    WHERE owner_key = ${ownerKey}
      AND (link_id = 0 OR link_id = ${linkId})
      AND sender_key IN (${linkSenderKey}, ${globalSenderKey})`);
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

export async function putActionTokens(rows) {
  if (!rows.length) return;
  let query = sql`INSERT INTO action_tokens (prefix, body, nonce, link_id, kind, expires_at) VALUES `;
  for (let i = 0; i < rows.length; i += 1) {
    if (i) query = sql`${query}, `;
    const row = rows[i];
    query = sql`${query}(${row.prefix}, ${row.body}, ${row.nonce}, ${row.link_id}, ${row.kind}, ${row.expires_at})`;
  }
  await db.run(query);
}

export async function getActionToken(prefix) {
  return db.get(sql`SELECT * FROM action_tokens WHERE prefix = ${prefix}`);
}

export async function deleteActionToken(prefix) {
  const result = await db.run(sql`DELETE FROM action_tokens WHERE prefix = ${prefix}`);
  return (result.rowsAffected ?? result.changes) > 0;
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
  // One atomic claim. The subquery and the update see the same write lock, so
  // a concurrent drain cannot claim the same row twice.
  const claim = randomHex(8);
  const result = await db.run(sql`UPDATE jobs SET state = 'sending', claim = ${claim}, claimed_at = ${now}
    WHERE id = (SELECT id FROM jobs
      WHERE state = 'pending' AND next_at <= ${now} ORDER BY id LIMIT 1)
      AND state = 'pending'
    RETURNING id, link_id, kind, payload_ct, payload_nonce, attempts, sent_ids`);
  return result.rows?.[0];
}

// A drain that dies between claim and finish leaves the row in 'sending'
// forever: the claim query only sees 'pending'. Reap claims older than the
// cutoff back to pending without spending their attempt budget.
export async function reapStaleClaims(cutoff) {
  await db.run(sql`UPDATE jobs SET state = 'pending', claim = NULL
    WHERE state = 'sending' AND claimed_at <= ${cutoff}`);
}

export async function setJobSent(id, sentIds) {
  await db.run(sql`UPDATE jobs SET sent_ids = ${sentIds} WHERE id = ${id}`);
}

export async function finishJob(id) {
  await db.run(sql`DELETE FROM jobs WHERE id = ${id}`);
}

export async function retryJob(id, nextAt) {
  await db.run(sql`UPDATE jobs SET state = 'pending', claim = NULL, attempts = attempts + 1,
    next_at = ${nextAt} WHERE id = ${id}`);
}

// A Telegram 429 is not a delivery failure; defer without spending the budget.
export async function deferJob(id, nextAt) {
  await db.run(sql`UPDATE jobs SET state = 'pending', claim = NULL, next_at = ${nextAt}
    WHERE id = ${id}`);
}

export async function failJob(id) {
  // A failed job is never retried; delete it so the encrypted sender id is not retained.
  await db.run(sql`DELETE FROM jobs WHERE id = ${id}`);
}

export async function setJobPayload(id, ct, nonce) {
  await db.run(sql`UPDATE jobs SET payload_ct = ${ct}, payload_nonce = ${nonce}
    WHERE id = ${id}`);
}

export async function bumpRate(linkId, senderKey, now, amount = 1) {
  const cutoff = now - 60;
  await db.run(sql`INSERT INTO rate_limits (link_id, sender_key, window_start, count)
    VALUES (${linkId}, ${senderKey}, ${now}, ${amount})
    ON CONFLICT(link_id, sender_key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${cutoff} THEN ${amount}
        ELSE rate_limits.count + ${amount} END,
      window_start = CASE WHEN rate_limits.window_start <= ${cutoff} THEN ${now}
        ELSE rate_limits.window_start END`);
  const row = await db.get(sql`SELECT count FROM rate_limits
    WHERE link_id = ${linkId} AND sender_key = ${senderKey}`);
  return Number(row?.count ?? 0);
}

export async function sweepRateLimits(cutoff) {
  await db.run(sql`DELETE FROM rate_limits WHERE window_start <= ${cutoff}`);
}

export async function openReplyWindow(row) {
  const result = await db.run(sql`INSERT INTO reply_windows
    (owner_key, link_id, target_ct, target_nonce, thread_id, prompt_message_id, original_id, expires_at)
    SELECT ${row.owner_key}, ${row.link_id}, ${row.target_ct}, ${row.target_nonce},
      ${row.thread_id ?? 0}, 0, ${row.original_id}, 0
    WHERE NOT EXISTS (SELECT 1 FROM owners
      WHERE owner_key = ${row.owner_key} AND memo_link_id IS NOT NULL)
    ON CONFLICT(owner_key) DO UPDATE SET
      link_id = excluded.link_id, target_ct = excluded.target_ct,
      target_nonce = excluded.target_nonce, thread_id = excluded.thread_id,
      prompt_message_id = 0, original_id = excluded.original_id, expires_at = 0
    WHERE NOT EXISTS (SELECT 1 FROM owners
      WHERE owner_key = ${row.owner_key} AND memo_link_id IS NOT NULL)`);
  return (result.rowsAffected ?? result.changes) > 0;
}

export async function setReplyPrompt(ownerKey, messageId) {
  await db.run(sql`UPDATE reply_windows SET prompt_message_id = ${messageId}
    WHERE owner_key = ${ownerKey}`);
}

export async function getReplyWindow(ownerKey, now) {
  const row = await db.get(sql`SELECT * FROM reply_windows WHERE owner_key = ${ownerKey}`);
  if (!row) return null;
  if (row.expires_at !== 0 && row.expires_at <= now) {
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
  const result = await db.run(sql`DELETE FROM links WHERE id = ${linkId}`);
  return result.rowsAffected ?? result.changes;
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
