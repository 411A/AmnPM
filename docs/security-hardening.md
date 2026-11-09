# Security hardening: branch `more-secure`

## Baseline (before this branch)

| Check | Result |
|---|---|
| Syntax check | 36 JS files + 2 JSON: pass |
| Lint | pass, 0 warnings |
| Full test suite | **171/171** |
| Real-account `e2e_all.py` (revision 98) | **36/36** |
| Real-account `e2e_extra.py` (revision 98) | **11/11** |
| Retention live suite (revision 98) | **40/40** |
| Bench p95 (in-memory, 100 ops) | open-link 1.38 ms, sender-message 1.48 ms, mode-delivery 2.66 ms |
| Bench SQL/op | 10.0 / 13.12 / 23.0 |

## Changes in this branch

1. **Named key domains** — content, identity/routing, action. `keyring.js`
   validates each domain and falls back to the old single-key secret so an
   older deployment still boots. The real `secret.js` was migrated with
   `tools/gen-secret.mjs`: content version 2 preserved; identity/action version
   1 added.
2. **Installation salt migrated lazily** — old `enc:` rows are decrypted with
   the content key and re-wrapped as `id:` under the identity key. The salt
   value is unchanged, so every existing derived key, block, and link remains
   valid.
3. **Owner and sender chat ids use the identity domain** — new links seal
   `owner_chat_ct` with the identity key; new conversations seal
   `sender_chat_ct` there too. Old rows fall back to the link data key. A
   content-key leak no longer reveals chat ids.
4. **Action tokens use the action domain** — reply/read/block buttons are
   sealed and opened with a per-link action key. Old tokens fall back to the
   link data key until their normal TTL. The existing split ciphertext (DB body
   + button suffix) is unchanged.
5. **Reply windows use the action domain** — the short-lived sender target is
   sealed with the action key; old windows fall back to the link data key.
6. **Album pending rows no longer carry a sender hash** — `pending.user_key`
   is now a link/direction batch scope (`msg:<link>` / `oalbum:<link>`), and
   non-album groups use a random group key. Grouped media behavior is
   unchanged; the current update's chat id is used for `copyMessages`.
7. **`/security`** — a RichMessage with expandable sections, added to the
   command menu in English and Persian. `/help` mentions it.
8. **`.env` key generation** — `tools/gen-secret.mjs` reads named key groups
   from `.env` (build time only) or preserves the existing `secret.js`, then
   writes the runtime module. Serverless has no runtime environment variables,
   so `secret.js` remains the deployed artifact.
9. **Data-lock safeguards** — the generator merges existing versions and never
   drops them; it refuses to replace a key under an existing version, refuses a
   missing `CURRENT_*`, refuses a fresh content key without an existing secret
   or `--init`, and refuses to advance `CURRENT_IDENTITY_KEK_VERSION` while
   owner/sender chat ids lack a version fallback. `.env.example` documents every
   group and the version rules.
10. **Security docs** — `docs/security-model.md` states the exact guarantees,
    the block-key limitation, and the rotation/data-lock rules.
11. **Internal build stamp and plain-language `/security`** — `tools/bundle.mjs`
    is the single bundle hash implementation; `tools/check-build.mjs` fails CI if
    `build.js` or `release/manifest.json` is stale. `/security` no longer sends a
    validator file. It uses four short sections: what is stored, who can see
    what, retention, and open source. It avoids TEE/attestation jargon. `/about`
    links to the public source as “open source”.
12. **Friendly copy** — `/security` and `/privacy` no longer mention media
    metadata, stolen servers/tokens, operator decryption, or Telegram’s own
    message copy. Those limitations remain in `docs/security-model.md` for
    technical readers.
13. **Language override** — `/language en|fa|auto` stores a per-user preference
    in `meta` and applies it to private-chat commands and menu callbacks. The
    default is still Telegram’s `from.language_code`. `/help` and the command
    menu list the command. English `/about` bot usernames no longer carry an RLM;
    Persian keeps it.
14. **Rename limits** — topic renames and memo changes are each limited to once
    per 24 hours per link. The timestamp is stored in the existing `meta` table
    (`rename:<kind>:<link id>`), so no schema change is needed. `/rename` sends
    the limit notice before the edit; the memo prompt includes the limit before
    the owner sends the new memo. A blocked attempt returns the remaining time.

No schema migration is required for this branch. `tgcloud push` is enough after
the secret is generated; the install-salt re-wrap is lazy.

## Feature-loss check

Kept: replies, read receipts, per-sender block, block-all/unblock, sender
topics, all three modes, forward mode, sender renames, owner renames, memos,
revoke, albums in both directions, retention, help/privacy/about. Added:
`/security` and `/language`; topic renames and memo edits now have a 24-hour
cooldown. No command, button, or behavior removed.

## Final results (after this branch)

| Check | Result |
|---|---|
| Syntax check | 41 JS files + 2 JSON: pass |
| Lint | pass, 0 warnings |
| Full test suite | **198/198** (baseline 171; +27 hardening/verification tests) |
| Bench n=300, baseline vs secure | open-link p95 2.28 → 2.24 ms; sender-message 2.21 → 2.27 ms; mode-delivery 4.01 → 4.01 ms; owner-start 0.68 → 0.80 ms |
| SQL per op, baseline vs secure | 10.09 → 10.07; 13.09 → 13.06; 23 → 23 |
| API per op | unchanged |
| Real-account `e2e_all.py` (revision 110) | **36/36** (last broad run before the 24h limit; see note) |
| Real-account `e2e_extra.py` (revision 110) | **11/11** |
| Real-account `e2e_rename_limit.py` (revision 112) | **19/19**: notice before rename, allowed first rename, blocked second rename with title unchanged, same-label no-op, memo prompt limit, memo allowed after topic limit, second memo alert, sender rename allowed/blocked, shared per-link topic limit, memo independence, cleanup |
| Retention live core (revision 99) | **7/7**; full 40-check suite was **40/40** on revision 98, retention code unchanged |
| `/security` live RichMessage | pass in English and Persian: four short sections; no fear-inducing details; no file upload; GitHub link works; `/help` lists the command |
| `/language` live | pass: both test accounts set to **fa**; `/privacy` and `/security` are Persian even though Telegram reports `en`; `/language auto` restores English |
| `/about` live | pass: English usernames have no RLM; Persian usernames keep RLM; “open source” links to GitHub |
| tgcloud | revision **112**, webhook in sync, tree clean |
| Branch / PR | `more-secure` / PR #1; CI success on `826d93c` (build stamp, lint, and all 198 tests) |

Note: `e2e_all.py` and `e2e_extra.py` were last green on revision 110. The
24-hour limit suite (`e2e_rename_limit.py`) passed **19/19** on revision 112
using only the two test accounts and only links it created, selected by unique
labels. It also passed **19/19** again with owner/visitor roles swapped
(HydraElit owner, Ali visitor), which avoids the full link cap on Ali’s account.
The broader suite was not rerun after the limit because it selects links by menu
order, which could touch non-test links. Later retries hit Pyrogram
`updates.GetState` timeouts while the VPN was off; those were network failures,
not feature failures. No production link was opened, renamed, or revoked.

Kept: replies, read receipts, per-sender block, block-all/unblock, sender
topics, all three modes, forward mode, sender renames, owner renames, memos,
revoke, albums in both directions, retention, help/privacy/about. Added:
`/security` and `/language`; topic renames and memo edits now have a 24-hour
cooldown. No command, button, or behavior removed.

The SQL and API counts are unchanged on every measured path. The small p95
differences are run-to-run noise; the only new cryptographic work is one
per-link HMAC when an action button is created or opened, and one random batch
key for a non-album sender message. Neither is on the delivered-message path
in a way that changes the query count.

## Deploy order for the branch

1. `node tools/gen-secret.mjs` (or fill `.env` first and run it).
2. Confirm `secret.js` exports the three named groups and versions.
3. Commit all source changes; the tree must be clean.
4. `node tools/gen-build.mjs --release v1.0.0 --commit <source-commit> --verified true`.
5. Copy the new commit and bundle hash into `release/manifest.json` and
   `release/notes.md`, then commit the stamp.
6. `node tools/check-build.mjs`; it must report `build check ok`.
7. `tgcloud push`.
8. `tgcloud status` and `tgcloud webhook`.
9. Run the two real-account suites and the retention suite.

Do not deploy a secret that reuses one key across domains; the generator
validates and preserves existing groups. Do not deploy a `build.js` whose hash
does not match the committed source.
