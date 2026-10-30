import { table, integer, text, index, uniqueIndex } from 'sdk/db';

export const meta = table('meta', {
  k: text('k').primaryKey(),
  v: text('v').notNull(),
});

export const owners = table('owners', {
  owner_key: text('owner_key').primaryKey(),
  lang: text('lang').notNull().default('en'),
  memo_link_id: integer('memo_link_id'),
  memo_message_id: integer('memo_message_id'),
  created_at: integer('created_at').notNull(),
});

export const links = table('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_lookup: text('token_lookup').notNull(),
  token_ct: text('token_ct').notNull(),
  token_nonce: text('token_nonce').notNull(),
  memo: text('memo').notNull(),
  slot: integer('slot').notNull().default(0),
  owner_key: text('owner_key').notNull(),
  owner_chat_ct: text('owner_chat_ct').notNull(),
  owner_chat_nonce: text('owner_chat_nonce').notNull(),
  dek_wrapped: text('dek_wrapped').notNull(),
  dek_nonce: text('dek_nonce').notNull(),
  kek_version: integer('kek_version').notNull(),
  state: text('state').notNull(),
  created_at: integer('created_at').notNull(),
}, (t) => [
  uniqueIndex('idx_links_token').on(t.token_lookup),
  index('idx_links_owner').on(t.owner_key, t.state),
]);

export const retired_tokens = table('retired_tokens', {
  token_fp: text('token_fp').primaryKey(),
  retired_at: integer('retired_at').notNull(),
});

export const link_slots = table('link_slots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  owner_key: text('owner_key').notNull(),
  slot: integer('slot').notNull(),
  created_at: integer('created_at').notNull(),
}, (t) => [
  uniqueIndex('idx_link_slots_unique').on(t.owner_key, t.slot),
]);

export const sessions = table('sessions', {
  user_key: text('user_key').primaryKey(),
  link_id: integer('link_id').notNull(),
  mode: text('mode'),
  updated_at: integer('updated_at').notNull(),
}, (t) => [
  index('idx_sessions_link').on(t.link_id),
]);

export const pending = table('pending', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_key: text('user_key').notNull(),
  link_id: integer('link_id').notNull(),
  group_key: text('group_key').notNull(),
  message_id: integer('message_id').notNull(),
  created_at: integer('created_at').notNull(),
}, (t) => [
  uniqueIndex('idx_pending_unique').on(t.user_key, t.group_key, t.message_id),
  index('idx_pending_group').on(t.user_key, t.group_key),
  index('idx_pending_link').on(t.link_id),
]);

export const conversations = table('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  link_id: integer('link_id').notNull(),
  sender_key: text('sender_key').notNull(),
  mode: text('mode').notNull(),
  indicator: text('indicator'),
  topic_id: integer('topic_id').notNull().default(0),
  created_at: integer('created_at').notNull(),
  last_at: integer('last_at').notNull(),
}, (t) => [
  uniqueIndex('idx_conversations_unique').on(t.link_id, t.sender_key, t.mode),
]);

export const topics = table('topics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  link_id: integer('link_id').notNull(),
  kind: text('kind').notNull(),
  conversation_id: integer('conversation_id').notNull().default(0),
  thread_id: integer('thread_id').notNull(),
  name: text('name').notNull(),
  state: text('state').notNull(),
}, (t) => [
  uniqueIndex('idx_topics_unique').on(t.link_id, t.kind, t.conversation_id),
]);

export const sender_topics = table('sender_topics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  link_id: integer('link_id').notNull(),
  sender_key: text('sender_key').notNull(),
  thread_id: integer('thread_id').notNull().default(0),
  name: text('name').notNull(),
  state: text('state').notNull(),
  created_at: integer('created_at').notNull(),
}, (t) => [
  uniqueIndex('idx_sender_topics_unique').on(t.link_id, t.sender_key),
  index('idx_sender_topics_link').on(t.link_id),
]);

export const blocks = table('blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  owner_key: text('owner_key').notNull(),
  link_id: integer('link_id').notNull().default(0),
  sender_key: text('sender_key').notNull(),
  created_at: integer('created_at').notNull(),
}, (t) => [
  uniqueIndex('idx_blocks_unique').on(t.owner_key, t.link_id, t.sender_key),
  index('idx_blocks_lookup').on(t.owner_key, t.sender_key),
]);

export const action_tokens = table('action_tokens', {
  prefix: text('prefix').primaryKey(),
  body: text('body').notNull(),
  nonce: text('nonce').notNull(),
  link_id: integer('link_id').notNull(),
  kind: text('kind').notNull(),
  expires_at: integer('expires_at').notNull(),
}, (t) => [
  index('idx_action_tokens_expiry').on(t.expires_at),
]);

export const jobs = table('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  link_id: integer('link_id').notNull().default(0),
  kind: text('kind').notNull(),
  payload_ct: text('payload_ct').notNull(),
  payload_nonce: text('payload_nonce').notNull(),
  state: text('state').notNull(),
  claim: text('claim'),
  attempts: integer('attempts').notNull().default(0),
  next_at: integer('next_at').notNull(),
  created_at: integer('created_at').notNull(),
}, (t) => [
  index('idx_jobs_due').on(t.state, t.next_at, t.id),
]);

export const rate_limits = table('rate_limits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  link_id: integer('link_id').notNull(),
  sender_key: text('sender_key').notNull(),
  window_start: integer('window_start').notNull(),
  count: integer('count').notNull(),
}, (t) => [
  uniqueIndex('idx_rate_limits_unique').on(t.link_id, t.sender_key),
]);

export const reply_windows = table('reply_windows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  owner_key: text('owner_key').notNull(),
  link_id: integer('link_id').notNull(),
  target_ct: text('target_ct').notNull(),
  target_nonce: text('target_nonce').notNull(),
  original_id: integer('original_id').notNull(),
  expires_at: integer('expires_at').notNull(),
}, (t) => [
  uniqueIndex('idx_reply_windows_owner').on(t.owner_key),
  index('idx_reply_windows_expiry').on(t.expires_at),
]);
