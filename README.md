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
    constants.js       user-facing emojis and callback tokens
    bot-config.js      one-time bot name, commands, descriptions, photo
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

All user-facing emojis and callback tokens live in `tgcloud/lib/constants.js`. Translation
strings use `{e.name}` placeholders resolved by `t()`, so changing an emoji is one edit in one
file; feature code imports `EMOJI` and `CALLBACK` directly.

## Deploy

```bash
cp tools/secret.example.js tgcloud/lib/secret.js   # fill in real keys; never commit it
CODE_COMMIT=$(git rev-parse --short HEAD)
node tools/gen-build.mjs --release v1.0.0 --commit "$CODE_COMMIT" --verified false
```

Commit `tgcloud/lib/build.js` and `release/manifest.json` (with the printed bundle hash,
`verified: true`, and `CODE_COMMIT`), then sign the manifest with the offline release key:

```bash
ssh-keygen -Y sign -f "$HOME/.ssh/amnpm-sign" -n release release/manifest.json
```

Commit `release/allowed_signers` and `release/signing-key.pub` once; commit the new
`release/manifest.json.sig` with each release. Publish **both** `release/manifest.json` and
`release/manifest.json.sig` as GitHub release assets, then deploy and run the preflight:

```bash
tgcloud push
tgcloud pull --force
node tools/verify-deployed.mjs --github --preflight
```

`--preflight` verifies the deployed/local hashes and the signatures when present; it skips a
signature that has not been published yet. Only after it prints `PREFLIGHT MATCH`, stamp the
same build and deploy again:

```bash
node tools/gen-build.mjs --release v1.0.0 --commit "$CODE_COMMIT" --verified true
tgcloud push
tgcloud migrate --yes
node tools/verify-deployed.mjs --github
tgcloud status
```

The final run has no `--preflight`: it prints `MATCH` only when the deployed build, the local
manifest, and the GitHub asset are all marked verified **and** both the local and published
manifest signatures verify. A missing or invalid signature fails the final run. `gen-build`
refuses `--verified true` on a dirty tree, a commit that is not an ancestor of `HEAD`, or any
`tgcloud` source change after that commit (the generated `build.js` stamp is exempt). The
bundle hash is unchanged by the stamp because `build.js` is excluded from it. The bot links the
label to the release page and shows `running code matches source` only while the stamp is true;
it never prints the hash. Keep `--verified false` for ordinary deploys.

The release private key (`~/.ssh/amnpm-sign`) stays offline and passphrase-protected; only the
public key and `release/allowed_signers` are committed. The signature covers the manifest bytes;
the manifest's bundle hash covers the application source, excluding `build.js` and `secret.js`.
Verification needs the OpenSSH `ssh-keygen` client. If the repository or the verifier itself is
compromised, re-check `release/allowed_signers` against the key fingerprint you trust.

`tgcloud/lib/secret.js` is gitignored and deployed as code. Generate it once per deployment;
losing it makes every stored link undecryptable. Rotating a key means adding a new version and
changing `CURRENT_KEK_VERSION`; older versions must stay in the ring while old links exist.

### Upgrading from an older revision

This revision uses a new session/sender key derivation (fast HMAC by default; optional PBKDF2)
and stores link tokens as an HMAC lookup plus AES-GCM ciphertext. Sessions, sender topics,
conversations, blocks, and links written by an older revision are keyed or shaped differently
and are not reused. Start from a fresh database (delete and recreate the bot or drop its
database) and create new links. The schema changed, so an old database cannot be migrated in
place; `tgcloud migrate` only creates the new schema. If the old database is kept, the bot will
not find old links and senders must start over.

The token is read by the CLI from `TGCLOUD_TOKEN` or `.tgcloud/credentials`. It is never placed
in this repository. `tgcloud push` deploys code; `migrate` applies the schema. A crash after
`push` still deploys — run `tgcloud fetch` before the next push.

Enable **Topics** for the bot in @BotFather. Without it, sender topic creation fails and senders
are asked to reopen the link; owner delivery falls back to unthreaded messages with a notice.

## Security

- **No plaintext identifiers.** Session and sender lookups use HMAC-SHA256 over a deployment
  salt by default. Setting `CONFIG.kdfIterations` above zero switches the lookup to PBKDF2; that
  is a deliberate speed/security tradeoff. Chat ids and message ids that must be recovered are
  AES-256-GCM ciphertext under a per-link data key. Link tokens are stored only as an HMAC
  lookup plus AES-GCM ciphertext; sender topic names are blank in the database. Memos, sender
  labels, sender chat ids, and the install salt are encrypted too. Message content is never
  stored.
- **Keys outside the repository.** Key-encryption keys live in `tgcloud/lib/secret.js`, which is
  gitignored and created once per deployment. The KEK ring is versioned so a rotation keeps old
  links readable while new links use the new key; the app refuses to boot unless every key is
  32 nonzero bytes of hex, so a typo cannot become a silent all-zero key. Encryption protects a
  leaked database or backup, not the platform operator who can read deployed code.
- **Optional DB brute-force cost.** By default a database dump alone cannot test guessed chat
  ids because the install salt is encrypted under the KEK. With the deployment key, candidates
  are testable at HMAC speed. Setting `CONFIG.kdfIterations` above zero makes each candidate cost
  a full PBKDF2 derivation; that raises the cost of bulk enumeration but does not make it
  impossible. Changing it invalidates stored sessions and sender keys.
- **What the operator can still do.** The deployment holds the KEK and receives every update,
  so the operator can decrypt stored fields, including link tokens, and, because Telegram ids
  are numeric, test candidate ids against the stored HMAC/KDF outputs. A configured KDF is a
  cost barrier, not a proof. Anonymity is from link owners and other users, not from the bot
  operator or Telegram.
- **Split action records.** Values needed only to answer a button are stored partly in the
  database and partly in `callback_data`; the database alone cannot reconstruct them. A callback
  is accepted only from the link owner for owner actions, or from the original sender for mode
  actions; forwarding a button does not grant access.
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

The default path uses one fast HMAC per incoming message; there is no PBKDF2 cost. Setting
`CONFIG.kdfIterations` above zero adds one PBKDF2 derivation per incoming message (~12 ms at
100,000 rounds on a development machine), so 1,000 messages/s needs roughly 12 CPU cores just
for the KDF. A single Telegram bot cannot deliver thousands of messages per second anyway: the
Bot API limits sends per bot and per chat. Scale-out means multiple bots, not a bigger handler.

## Bot metadata

On the first owner `/start`, `tgcloud/lib/bot-config.js` sets the bot name, commands (English
and Persian), description, short description, and menu button. It is fire-and-forget: `/start`
does not wait for it. `bot_config_version` makes it one-time; bump `CONFIG_VERSION` in that file
to reapply. The bot never changes the profile photo; set it manually in @BotFather.

## Receive modes

Each owner chooses which delivery modes senders can use. `/settings` → **Receive modes** shows the
toggles; the setting is stored on the owner row and applies to all their links. Disabled modes are
removed from the sender's mode buttons and rejected if an old chooser is clicked. At least one mode
must stay enabled.

## Retention

`retired_tokens` is the only table that grows without bound: an 8-byte fingerprint per revoked
link, kept so a token can never be issued twice. At 10,000 new links per day that is roughly
36 MB per year. It holds no owner, sender, or message reference.

Revocation deletes every link-scoped row (jobs, actions, rates, blocks, topics, conversations,
pending messages, sessions, reply windows, the link itself). Telegram history is retained by
design; the owner topics receive a “topic closed” notice and are closed where the API permits,
and the sender is told “Stored data deleted” when they next open the link or write in that
sender topic.

Global **Block all** rows are owner-level and are not link-scoped; they survive revocation and
apply to other links. Link-scope blocks are deleted with the link. A global block stores a fast
HMAC of the blocked sender so it works across links, which the operator can resolve to a sender
id; a link-scope block uses the per-link sender key.

## Topic names

Rename a topic with `/rename <name>` inside it. The bot always prepends the mandatory
direction/mode marker: `⬇️ 👽` (anonymous), `⬇️ 😶‍🌫️` (history), `⬇️ 😎` (forward), or
`⬆️` (sender topic). Owner topic names keep the memo at the end (`marker + custom · memo`), so a
rename never drops it and a later memo change updates every owner topic, including renamed ones.
A leading U+200E left-to-right mark keeps the marker on the left when the custom name is RTL.
Owner-chosen names are stored encrypted under the link key; sender-chosen names stay only in
Telegram. The Bot API has no read-topic-name method, so a rename made in the Telegram UI cannot
be observed or repaired; only `/rename` is enforced.

Replies and status messages sent from inside a topic carry `message_thread_id`, so they stay in
that topic instead of leaking into the All/General chat. Senders must write in their link topic:
a message in All is answered with a pointer to that topic (or a fresh link button), never
delivered. In a history/forward topic the owner can simply type: the bot copies that message to
the sender's link topic as a reply to the latest message from that sender, with no Answer button.
In the anonymous topic, press Answer to choose the sender; the choice is one-shot and has no time
limit, and the prompt has a Cancel button. The owner's answer follows the thread of the sender's
original message, so it lands in the same topic; if that topic was deleted, the bot recreates the
link topic and retries instead of silently dropping the answer into All. On revoke, owner topics
receive a “topic closed” notice, and the sender is told “Stored data deleted” the next time they
open the link or write in that sender topic. A sender chat id is stored only as AES-GCM
ciphertext: in history/forward conversations for direct replies, and in the one-shot anonymous
reply window. It is deleted with the link. Immediate push notifications would need a server
trigger, which the platform does not provide.

## Concurrency and routing

- A sender's link topic is the only routing authority. Messages in All are never delivered;
  they get a pointer to the link topic (or a fresh link button if the topic is missing).
- A pending mode group is claimed by exactly one callback. Double taps and two different mode
  buttons deliver once.
- Owner reply windows are single, atomic, one-shot, and matched to the topic where Answer was
  pressed. A new Answer explicitly replaces the target; a reply from another thread is not
  captured. Per-sender topics do not need Answer at all and reply to their latest message.
- Memo prompts and reply windows exclude each other with atomic claims.
- Topic creation reserves the unique `(link, kind, conversation)` slot before calling Telegram;
  a concurrent delivery reuses the row or retries after the creator finishes.
- Delivery jobs record the copied message ids, so a failed control send retries the controls
  without copying the message a second time.
- Revocation marks the link `revoked` before deleting; queued jobs check the state and drop.
- Block buttons carry their target state, are consumed once, and are replaced with fresh tokens,
  so a double tap cannot flip the block back.

The platform has no transactions. A crash between a Telegram API call and its database
acknowledgement can duplicate a message or leave an orphan topic; it cannot change the routing
identifiers, which are always link-, chat-, and thread-scoped and bound by encryption AAD.

## Known limits

- Albums always ask for a mode tap once, even after a mode is set, because the tap is the only
  barrier that proves the whole album arrived (the platform has no timers).
- A failed owner-topic creation is cached as unavailable until the link is revoked; enabling
  Topics in @BotFather after the first failure needs a new link. Sender topics are retried on
  `/start`.
- Delivery is at-least-once. A crash between a successful send and the job acknowledgement can
  duplicate one message; a lost message is never preferred.
- Per-sender topics created before the direct-reply migration have no encrypted sender chat id
  yet. One Answer press or one new sender message stores it; then typing works directly. New
  topics are immediate.
- `closeForumTopic` is documented for supergroups only; in a bot chat the notice is posted and
  the topic may remain open.
