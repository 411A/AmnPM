# Security model

This page states exactly what AmnPM protects and what it does not. It is the
source for `/security`; if the code and this page disagree, the code is wrong.

## Keys

Three key domains, each with its own named key set in `tgcloud/lib/secret.js`:

- **Content**: wraps each link's per-link data key. Protects link tokens, memos,
  topic names, alias labels, and job payloads.
- **Identity/routing**: wraps the installation salt. Protects owner chat ids,
  sender conversation chat ids, owner keys, sender routing keys, sessions,
  rate-limit keys, and block keys.
- **Action**: derives per-link action keys for reply, read, and block buttons.

The domains are separate so a leak of one does not automatically open the
others. A full compromise of all three does. The deployment operator holds the
keys and can decrypt stored fields; encryption protects the database, not an
operator with all keys.

Existing data is migrated without changing its plaintext:

- An old `enc:` installation salt is decrypted with the content domain and
  re-wrapped as `id:` under the identity domain. The salt value is unchanged,
  so every existing sender/block/link key remains valid.
- Action tokens created before the action domain remain readable until their
  normal TTL by falling back to the link data key. New tokens use the action
  domain.
- Reply windows created before the action domain fall back the same way.

## Stored data

- Links: token lookup, encrypted token, encrypted memo, encrypted owner chat
  id, wrapped per-link data key, state, activity/retention timestamps.
- Topics: thread id, kind, state, encrypted custom name.
- Sender routing: sender key (keyed hash), sender topic thread, encrypted
  conversation chat id, sessions, per-sender rate limits.
- Blocks: owner key + link scope + keyed sender hash. The Telegram user id is
  **not** stored in the block table.
- Jobs: encrypted payload until delivery; deleted after delivery.
- Action tokens: incomplete ciphertext. The missing fragment lives only in the
  Telegram button. The database does not hold the full ciphertext.
- No message content is stored after delivery. No logs, no analytics.

## Compromise levels

| Compromise | Result |
|---|---|
| Database only | Ciphertext and keyed hashes; no plaintext sender ids. |
| Database + content keys | Message/link/memo/topic content readable. Identity, block, and action domains remain separate. |
| Database + all key domains | Block and routing hashes can be enumerated against Telegram ids; action/reply ciphertext can be opened if the button fragment is also available. |
| Bot runtime or bot token | Incoming updates and plaintext sender ids are visible. This defeats any storage-level anonymity. |
| Telegram itself | Telegram always knows the sender, the message, and the timing. |

## Blocking

A block must recognize the same sender on future messages. That requires a
stable value derived from the sender's Telegram id. AmnPM stores a per-link
keyed hash (owner-wide for Block everywhere) in the identity domain, not the id. The key is the barrier: if the
identity key is compromised, the hash can be enumerated because Telegram ids
are a small space. No hash construction can avoid that while keeping automatic
blocking. A full identity-key compromise links the block list.

## Key rotation and data-lock safety

A version number maps to one key forever. To rotate, **add a new version** and
set `CURRENT_*` to it; keep every old version. Old rows store the version they
were written with:

- Content: `links.kek_version` selects the old content key. Safe to add a new
  content version.
- Action: old tokens try every action version, then fall back to the link data
  key. Safe to add a new action version; keep old versions until tokens expire.
- Identity: the installation salt stores `id:<version>`. Old identity keys must
  remain. New owner/sender chat ids do **not** store an identity version yet, so
  `CURRENT_IDENTITY_KEK_VERSION` must not advance until the fallback or a
  re-encryption migration lands. The generator refuses the change.

There is no automatic re-encryption. Retiring an old key requires a migration
that re-wraps or re-encrypts every row still using it. The generator always
merges existing versions, never drops them, refuses to replace a key under an
existing version, refuses a missing current version, and refuses to invent a
fresh content key without an existing secret or `--init`.

What cannot be guaranteed:

- If every copy of `secret.js` (and `.env` if used) is lost, the stored
  ciphertext cannot be recovered. Keep an offline backup.
- If the database is lost, keys cannot restore it.
- If the installation salt value itself is changed (not just re-wrapped), every
  derived owner/sender/block key changes and old routing/block data is orphaned.
- Manually editing `secret.js` or the database can bypass every guard.

The tool can prevent accidental key replacement/drop; it cannot prevent key
loss or platform data loss.

## Actions and replies

Reply, read, and block payloads are encrypted and split: the database stores an
incomplete ciphertext, and the Telegram button carries the last fragment. A
database dump plus the key cannot open the action without the owner's message.
New action tokens use the action domain. Reply windows store the sender target
with the action domain for their short lifetime; old rows fall back to the link
data key.

## Retention

Links with no delivered activity for 12 months are deleted after a 30-day
reminder. The check runs at most weekly, on bot updates. Telegram keeps its own
history. Deleting a topic in the Telegram client does not notify the bot; the
next send can resurrect the same topic. The TTL is the guaranteed cleanup.

## Source and build verification

The repository publishes the source and a reproducible bundle hash. `tools/check-build.mjs` fails CI if `tgcloud/lib/build.js` is stale: its hash and file list must match the source tree and `release/manifest.json`. The hash is the SHA-256 of each `.js` file in sorted walk order, as relative path + NUL + bytes; `build.js` and `secret.js` are excluded.

`/security` sends `amnpm-validator-<commit>.js`, a standalone Node 18+ script. It fetches the public GitHub tree at the pinned commit, applies the same file order and hash, and compares the result with the embedded bundle hash. It reports missing or extra `.js` files and exits non-zero on any mismatch. The user runs it on their own machine; the bot never executes it.

What this proves:

- the public source at that commit hashes to the embedded bundle hash;
- the file list matches the published tree;
- CI rejects a stale build stamp.

What it does not prove:

- that the running Telegram Serverless deployment is that artifact. A modified deploy can change `build.js` or the validator, and a bot-sent file is not a root of trust.
- Telegram Serverless exposes no platform-signed deployment digest or TEE attestation. Only self-hosting the same source, a platform attestation, or end-to-end encrypted content closes that gap.

The validator is evidence about the source and build, not runtime proof. Users should inspect it, compare it with the generator in `tgcloud/lib/validator.js`, and run it themselves.

## Limits

- Telegram always knows the sender. No bot can hide that.
- A compromised runtime or bot token sees updates in plaintext.
- Media metadata (EXIF and document metadata) can identify a sender. It is not
  stripped by default; preserving the original file is a deliberate feature.
- Text and timing can identify a sender even when no account id is stored.
- Client-side topic deletion is invisible to the bot; Telegram may accept a
  later write and resurrect the topic.
- The block list remains the unavoidable pseudo-identity while automatic
  per-sender blocking is a feature.
