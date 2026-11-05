# Handover: Telegram topic rename visibility

## HARD BOUNDARY: production accounts

Links **6 and 7 are other users' production accounts** (and link 8 must be
treated as production too unless proven otherwise). Never enumerate links, never
send to owner chats, never rename or revoke them. Work **only** with the two
provided test accounts (`Ali 6381228009`, `HydraElit 2055683815`) and links those
accounts create themselves. Any diagnostic must be scoped to a link created in
the current test run.

Incident on 2026-11-05 (recorded so it is not repeated):
- Enumerated all links and renamed topics of links 6/7/8 to
  `main-visible-1793699`; `renameTopics` later restored them (0 failures).
- Sent two bot messages `AmnPM account check: link 6` and `link 7` to the real
  owners' chats. Their message ids were not stored, so they could not be
  deleted. The owners can delete them.
- Sent one `pin-test` message to link 8's owner chat and unpinned it; the message
  remains.
- No link data, memos, tokens, or messages were read or deleted.

## User-reported behavior (treat as authoritative)

The user states that in this bot they previously **saw a Telegram service message
on topic rename**, and that renames (including memo/instance renames) **applied
instantly** in the client. Do not dismiss this as impossible. Our tests were run
from a different account/session and must not be used to overrule the user's
first-hand observation. The next agent should reproduce on the user's actual
owner chat before concluding anything about service messages.

## Symptom (current)

`/rename` and memo changes update the bot's stored name and the Telegram API
returns success, but the client keeps showing the old topic title. Users see no
"topic renamed" service message.

## What is verified (scope: test accounts only)

These observations come from the test account `Ali 6381228009` and must not be
generalised to the user's chat:

1. `editForumTopic` is called correctly (`tgcloud/handlers/message.js`
   `renameTopic`, `tgcloud/lib/topics.js` `renameTopics`) and returns `ok`.
2. Telegram stores the new name: reading the topic list back with MTProto
   `getForumTopics` (user session) returns the new title immediately.
3. In Ali's session, no `messageActionTopicEdit` service message was delivered
   for bot edits; only the bot's normal confirmation messages appeared.
4. Ali's owner chat is `type: private`, `is_forum: false`, and
   `closeForumTopic`/`reopenForumTopic` are rejected there
   ("not a supergroup forum"). This may not describe the user's chat.

## Counter-evidence and account mismatch

There are **three different owner chats** in the live DB (owner hashes
`e99ccea95a0f`, `98b82c454d0b`, `51996228671b`), and links 6/7/8 belong to them,
not to the test accounts. Earlier "live" checks therefore validated the wrong
chat.

Renaming all five topics of links 6/7/8 to `main-visible-1793699` returned `ok`
for each; the user confirmed **two topics visibly changed in their client**, with
**no service messages**. So client refresh does happen for some topics without
service messages, and the user's report of instant renames in their own chat is
credible. The open question is why some topics do not refresh.

## Restore status

Completed on 2026-11-04: `renameTopics` ran for all three links and restored
kind + alias + memo names with **0 failures** (threads 1478966/1478961, 727903,
150563/150566). If any name still looks wrong, re-run the same path and verify
with the owning account's `getForumTopics`.

## Current live state

Restored: the five topics of links 6/7/8 carry their proper kind + alias + memo
names again (0 failures). Nothing is left temporarily named
`main-visible-1793699`.

## Hermes comparison

`NousResearch/hermes-agent` PR #137423 and gateway code call the same
`edit_forum_topic(chat_id, message_thread_id, name)` with no service-message or
recreation logic. Their tests only assert the API call. There is nothing extra
to copy.

## What not to do

- Do not tell users to reopen the chat: a 20-hour-old client still showed the
  old title in at least one case.
- Do not dismiss the user's claim that service messages appeared; our
  observation came from a different account. Reproduce on theirs first.
- Do not delete/recreate topics as a "rename": it destroys the thread history.

## Suggested next steps

1. Restore the five topic names (endpoint above).
2. Identify the owner of links 6/7/8 (owner hash groups) and test a rename there
   on one **currently visible** topic; ask which topics visibly update.
3. Compare updated vs non-updated topics: creation age, whether the topic was
   open/visible, whether it has a DB row (`topics` table), state, and thread id.
4. If only stale/no-row topics fail, the cause is mapping, not renaming.
5. If linked, visible topics still fail, capture the client version and test the
   same bot action from a second client (Desktop vs mobile) before changing code.
6. Only if clients never refresh linked topics, consider topic replacement
   (new thread, old history stays) as a product decision.

## Key files

- `tgcloud/handlers/message.js` — `/rename`, memo flow, `asCommand`
- `tgcloud/lib/topics.js` — `renameTopics`, `isTopicNameTaken`
- `tgcloud/lib/i18n.js` — rename/memo strings
- `real-account-tests/` — live harness (git-excluded); `e2e.py`,
  `e2e_all.py`, `e2e_extra.py`; sessions in `%LOCALAPPDATA%\amnpm-e2e`
- `docs/audit-2026-11-03.md` — earlier audit, platform-limit section

## State of the repo

- 148 JS tests pass; lint clean; CI green at `af7f39f`; live tgcloud rev 94.
- Working tree clean except the temporary `tgcloud/endpoints/restoretopics.js`.
