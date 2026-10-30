# AmnPM

One centralized Telegram bot for anonymous, link-scoped messaging on **Telegram Serverless**
(tgcloud). Owners create short links; visitors message them anonymously, anonymously with
history, or with their profile forwarded. Delivery is organized into per-link forum topics.
Revoking a link deletes everything the bot stored for it and destroys the key that could
decrypt it.

## Layout

```
tgcloud/
  schema.js            tables + indexes (sdk/db DSL)
  handlers/
    message.js         commands, link sessions, owner replies
    callback_query.js  mode, answer, read, block, revoke, memo
  lib/
    config.js          limits, repo/contact
    secret.js          KEK ring (deploy-only, never committed)
    secret.example.js  template for secret.js
    build.js           generated at deploy: release, commit, bundle hash, verified
    crypto.js          AES-256-GCM, HMAC, split records
    ids.js             tokens, memos, indicators
    words.js           vendored 4096-word list (data only)
    store.js           every SQL statement
    keys.js            link keys, sealed actions, sealed jobs
    queue.js           durable outbox drain
    delivery.js        topics + jobs for a message or album
    topics.js          create/reuse/rename/close
    render.js          message and keyboard builders
    i18n.js            English + Persian
tests/                 node:test suite with an SDK stub
tools/                 word list and build stamp generators
```

## Development

```bash
node tools/gen-words.mjs path/to/eff_large_wordlist.txt
node tools/gen-build.mjs --commit local
node --import ./tests/register.mjs --test tests/crypto.test.js tests/ids.test.js \
  tests/store.test.js tests/handlers.test.js tests/render.test.js tests/source.test.js
```

`tests/loader.mjs` maps `sdk` and `sdk/db` onto `tests/stub-*.mjs`, so the suite runs offline.
`package.json` is development-only and is never deployed.

## Deploy

```bash
cp tools/secret.example.js tgcloud/lib/secret.js   # fill in real keys; never commit it
node tools/gen-build.mjs --commit "$(git rev-parse --short HEAD)" --verified false
tgcloud push
tgcloud migrate --yes
tgcloud status
```

`tgcloud/lib/secret.js` is gitignored and deployed as code. Generate it once per deployment;
losing it makes every stored link undecryptable. Rotating a key means adding a new version and
changing `CURRENT_KEK_VERSION`; older versions must stay in the ring while old links exist.

### Upgrading from an older revision

This revision derives session and sender keys with PBKDF2 and stores link tokens as an HMAC
lookup plus AES-GCM ciphertext. Sessions, sender topics, conversations, blocks, and links
written by an older revision are keyed or shaped differently and are not reused. Start from a
fresh database (delete and recreate the bot or drop its database) and create new links. The
schema changed, so an old database cannot be migrated in place; `tgcloud migrate` only creates
the new schema. If the old database is kept, the bot will not find old links and senders must
start over.

The token is read by the CLI from `TGCLOUD_TOKEN` or `.tgcloud/credentials`. It is never placed
in this repository. `tgcloud push` deploys code; `migrate` applies the schema. A crash after
`push` still deploys — run `tgcloud fetch` before the next push.

Enable **Topics** for the bot in @BotFather. Without it, `createForumTopic` fails and delivery
falls back to unthreaded messages in the owner's chat.

## Security

- **No plaintext identifiers.** Session and sender lookups use PBKDF2-HMAC-SHA256
  (100,000 rounds) over a deployment salt; per-link sender keys are HMACs of that base. Chat ids
  and message ids that must be recovered are AES-256-GCM ciphertext under a per-link data key.
  Link tokens are stored only as an HMAC lookup plus AES-GCM ciphertext; sender topic names are
  blank in the database. Memos, sender labels, and the install salt are encrypted too. Message
  content is never stored.
- **Keys outside the repository.** Key-encryption keys live in `tgcloud/lib/secret.js`, which is
  gitignored and created once per deployment. The KEK ring is versioned so a rotation keeps old
  links readable while new links use the new key. Encryption protects a leaked database or
  backup, not the platform operator who can read deployed code.
- **Expensive DB brute force.** Session and sender keys are PBKDF2-derived. A database dump
  alone cannot test guessed chat ids; with the deployment key, candidates are testable, but
  each candidate costs a full PBKDF2 derivation. That raises the cost of bulk enumeration; it
  does not make it impossible. Changing `CONFIG.kdfIterations` invalidates stored sessions and
  sender keys.
- **What the operator can still do.** The deployment holds the KEK and receives every update,
  so the operator can decrypt stored fields, including link tokens, and, because Telegram ids
  are numeric, test candidate ids against the stored KDF outputs. The per-candidate KDF is the
  barrier, not a proof. Anonymity is from link owners and other users, not from the bot operator
  or Telegram.
- **Split action records.** Values needed only to answer a button are stored partly in the
  database and partly in `callback_data`; the database alone cannot reconstruct them.
- **Crypto-shredding (live data).** Revoking a link deletes the link row and every link-scoped
  row, including the wrapped data key, so the live database can no longer decrypt anything for
  that link. A backup that still contains the wrapped key can be decrypted with the deployment
  KEK; shredding is not protection against the operator or against older backups.
- **Door.** Handlers never throw; every write is one atomic statement; unique constraints
  replace transactions.

### Trust model

This is a centralized bot. The operator can read updates, the deployment, the key-encryption
keys, and the database, and can change and redeploy code. No application code can prevent that.
The repository does not claim otherwise.

The narrower guarantees are: message content is never stored; link tokens, chat ids, memos,
sender labels, and routing targets are ciphertext or one-way derivations; the main handlers
contain no logging, environment reads, or outbound network code, and CI rejects such lines. A
database-only leak is useless, and a tracked code change that spies is a visible diff that fails
CI. A deploy from an uncommitted tree can bypass CI, so deploy only from a green commit.

“Not even the operator” requires the key to live outside the operator's control: an external
KMS/HSM with audited access, threshold keys, or client-side end-to-end encryption. Those add
latency or change the Telegram flow and are not implemented.

## Performance

One PBKDF2 derivation is computed per incoming message (~12 ms on a development machine); the
per-link session/sender keys are then fast HMACs. At 1,000 messages/s that is roughly 12 CPU
cores just for the KDF. A single Telegram bot cannot deliver thousands of messages per second
anyway: the Bot API limits sends per bot and per chat. Scale-out means multiple bots, not a
bigger handler.

## Retention

`retired_tokens` is the only table that grows without bound: an 8-byte fingerprint per revoked
link, kept so a token can never be issued twice. At 10,000 new links per day that is roughly
36 MB per year. It holds no owner, sender, or message reference.

Revocation deletes every link-scoped row (jobs, actions, rates, blocks, topics, conversations,
pending messages, sessions, reply windows, the link itself). Telegram history is retained by
design; the topics receive a deletion notice and are closed where the API permits.

## Known limits

- Albums always ask for a mode tap once, even after a mode is set, because the tap is the only
  barrier that proves the whole album arrived (the platform has no timers).
- A failed topic creation is cached as unavailable until the link is revoked; enabling Topics in
  @BotFather after the first failure needs a new link.
- Delivery is at-least-once. A crash between a successful send and the job acknowledgement can
  duplicate one message; a lost message is never preferred.
- `closeForumTopic` is documented for supergroups only; in a bot chat the notice is posted and
  the topic may remain open.
