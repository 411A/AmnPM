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
7. **`/security`** — a RichMessage with short, plain-language sections, added to
   the command menu in English and Persian. `/help` mentions it.
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
11. **Build stamp and `/security`** — `tools/bundle.mjs` is the single bundle
    hash implementation; `tools/check-build.mjs` fails CI if `build.js` or
    `release/manifest.json` is stale. `/security` uses four short sections.
    `/about` links to the public source as “open source”.
12. **Friendly copy** — `/security` and `/privacy` avoid fear-inducing details.
    The full limitations remain in `docs/security-model.md`.
13. **Language menu** — `/settings` → Language, below Receive modes, offers
    `🇬🇧 English` and `فارسی 🇮🇷`. The choice is stored per user. The `/language`
    command was removed.
14. **Rename limits** — topic renames are limited to once per 24 hours per
    topic; memo changes once per 24 hours per link. Owner and sender topics have
    separate counters. `/rename` warns before the edit; the memo prompt states
    the limit. Timestamps live in `meta` and are deleted on link purge.
15. **Release metadata generation** — `tools/gen-build.mjs` writes `build.js`,
    `release/manifest.json`, and `release/notes.md` in one run. `--commit`
    defaults to `HEAD`; `--verified true` requires a clean tree and a release
    name.

No schema migration is required for this branch. `tgcloud push` is enough after
the secret is generated; the install-salt re-wrap is lazy.

## Feature-loss check

Kept: replies, read receipts, per-sender block, block-all/unblock, sender
topics, all three modes, forward mode, sender renames, owner renames, memos,
revoke, albums in both directions, retention, help/privacy/about. Added:
`/security` and the **Settings → Language** menu; the standalone `/language`
command was removed. Topic renames and memo edits now have a 24-hour cooldown.
No other command, button, or behavior removed.

## Final results (after this branch)

| Check | Result |
|---|---|
| Syntax check | 41 JS files + 2 JSON: pass |
| Lint | pass, 0 warnings |
| Full test suite | **199/199** (baseline 171; +28 hardening/verification tests) |
| Bench n=300, baseline vs secure | open-link p95 2.28 → 2.24 ms; sender-message 2.21 → 2.27 ms; mode-delivery 4.01 → 4.01 ms; owner-start 0.68 → 0.80 ms |
| SQL per op, baseline vs secure | 10.09 → 10.07; 13.09 → 13.06; 23 → 23 |
| API per op | unchanged |
| Real-account `e2e_all.py` (revision 110) | **36/36** (last broad run before the 24h limit; see note) |
| Real-account `e2e_extra.py` (revision 110) | **11/11** |
| Real-account `e2e_rename_limit.py` (revision 117) | **21/21**: notice before rename, allowed first rename, blocked second rename with title unchanged, same-label no-op, memo prompt limit, memo allowed after topic limit, second memo alert, sender rename allowed/blocked, **owner can still rename after the sender renamed**, second owner rename blocked, memo independence, cleanup; language setup also uses **Settings → Language** |
| Retention live core (revision 99) | **7/7**; full 40-check suite was **40/40** on revision 98, retention code unchanged |
| `/security` live RichMessage | pass in English and Persian: four short sections; no fear-inducing details; no file upload; GitHub link works; `/help` lists the command |
| Settings → Language live | pass: `🇬🇧 English` / `فارسی 🇮🇷` row on both test accounts; switching to Persian makes `/privacy` and `/security` Persian even though Telegram reports `en`; switching back restores English |
| `/about` live | pass: “open source” links to GitHub |
| Release | **v1.1.0** at `844cda1`; `manifest.json` asset published; `verify-deployed --github` **MATCH** |
| tgcloud | revision **118**, webhook in sync, tree clean |
| Branch / PR | `more-secure` merged into `main`; CI, CodeQL, and dependency review green on `844cda1` (199 tests) |

Note: `e2e_all.py` and `e2e_extra.py` last ran on revision 110. The 24-hour
suite (`e2e_rename_limit.py`) passed **21/21** on revision 117 with owner/visitor
roles swapped. The broader suite was not rerun to avoid non-test links. No
production link was touched.

The SQL and API counts are unchanged on every measured path. The small p95
differences are run-to-run noise; the only new cryptographic work is one
per-link HMAC when an action button is created or opened, and one random batch
key for a non-album sender message. Neither is on the delivered-message path
in a way that changes the query count.

## Deploy order for the branch

1. `node tools/gen-secret.mjs` (or fill `.env` first and run it).
2. Confirm `secret.js` exports the three named groups and versions.
3. Commit all source changes; the tree must be clean.
4. `node tools/gen-build.mjs --release v1.1.0 --verified true`. It writes
   `tgcloud/lib/build.js`, `release/manifest.json`, and `release/notes.md`
   together; `--commit` defaults to `HEAD`.
5. Commit the three generated files.
6. `node tools/check-build.mjs`; it must report `build check ok`.
7. `tgcloud push`; `tgcloud fetch` updates the local snapshot.
8. `tgcloud migrate --yes` if the schema changed.
9. `tgcloud status` and `tgcloud webhook`.
10. Run the three real-account suites: `e2e_all.py`, `e2e_extra.py`, and
    `e2e_rename_limit.py`; then run the retention suite.

Do not deploy a secret that reuses one key across domains; the generator
validates and preserves existing groups. Do not deploy a `build.js` whose hash
does not match the committed source.
