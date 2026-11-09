# Retention: idle links, topics, and notifications

## What runs

- `links.last_activity_at` is a plaintext Unix timestamp, updated after every
  successful delivery in either direction. A new link starts at `created_at`.
- The first sweep after deploy sets every `last_activity_at = 0` row to that
  moment, so existing links receive a full 365-day grace period.
- `maybeSweep` runs on every message/callback update, at most once per 168 hours
  (atomic `meta` lease). Serverless has no cron: with no updates there is no
  sweep, and therefore no new data.
- Day 335–365: one reminder to the owner's main chat. A failed reminder is not
  retried; expiry still happens on schedule.
- Day 365+: the link is atomically claimed, owner topics are closed/renamed,
  all link-scoped rows are deleted, the token fingerprint is retired, and one
  deletion notice is sent best-effort. Notification failure never blocks
  deletion. Rename-limit timestamps in `meta` are deleted with the link.
- A delivery that fails with `message thread not found` twice marks that owner
  topic dead. If no live owner topic remains, the link is purged immediately.
  No topic is ever recreated by delivery; a sender must reopen the link.
- Batches are 10 reminders and 3 purges per run. A larger backlog keeps a
  5-minute lease and drains over subsequent updates, not over weeks.

## Client-side topic deletion

Deleting a topic in the Telegram client does **not** notify the bot. Live
verification on the two test accounts showed that the bot's next send
**recreated the same topic** (same thread id, same title) and the link stayed
active. This is Telegram's behavior, not the bot creating a new thread.

Therefore the immediate dead-topic purge only runs when Telegram actually
returns `message thread not found` twice. A real client-side deletion does not
produce that error. The 365-day TTL is the only guaranteed cleanup for a
client-side deletion; the 335-day reminder is the only warning.

The same applies to a sender topic: an owner reply resurrected the same sender
topic (same thread id). The `recreateSenderTopic` path is a fallback for an
actually invalid thread; a fault-injected invalid thread was verified to create
a new sender topic and accept messages.

## What cannot be done

- The Bot API has **no `getForumTopics`** method. The official
  `tdlib/telegram-bot-api` server implements `createForumTopic`,
  `editForumTopic`, `closeForumTopic`, and `deleteForumTopic`, but no listing
  call. A per-topic probe would have to call `editForumTopic` with a guessed
  name, which overwrites manual renames. There is therefore **no safe
  background topic reconciliation**: deletion is detected by delivery failure,
  and idle links are caught by the TTL.
- Telegram sends no update when a user deletes a chat, a topic, or messages.
  Clearing history and deleting the chat are silent. Blocking the bot is only
  visible as a 403 on send.
- `deleteForumTopic` is supergroup-only. In these private chats a topic can be
  closed/renamed, not deleted. Telegram keeps its own history.
- Sender-side topics are database rows too; they are deleted with the link, but
  the topic in the sender's chat remains.
- Retired token and alias fingerprints are kept forever so links and aliases
  are never reused.
- Owner rows (language, modes) and global blocks remain. Only link-scoped data
  is deleted.
- A notice may resurrect a chat the owner deleted: Telegram has no "deleted"
  state for bots. Notices are best-effort and skipped when Telegram returns 403.

## Deploy order

1. `tgcloud migrate --yes --local` — adds `state_at`, `last_activity_at`,
   `reminded_at`, and `idx_links_state_activity`.
2. `tgcloud push`.
3. `tgcloud status`.

The migration must run first: the new code inserts those columns.

## Tests

- `tests/retention.test.js`: 334/335/365/366-day boundaries, one reminder only,
  no retry after a failed reminder, blocked/unreadable owner chat, full row
  deletion plus token retirement, backfill, lease, backlog draining, suppressed
  per-topic notice on expiry.
- `tests/migration.test.js`: old links table upgraded with `ALTER TABLE`.
- `tests/handlers.test.js`: dead topic is not recreated, one transient retry,
  and one dead topic does not purge a link with another live topic.
- `.github/workflows/test.yml` runs retention and migration as their own CI
  section.
