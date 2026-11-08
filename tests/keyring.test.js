import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import * as store from '../tgcloud/lib/store.js';
import * as keys from '../tgcloud/lib/keys.js';
import * as crypto from '../tgcloud/lib/crypto.js';
import { ownerSalt } from '../tgcloud/lib/links.js';
import {
  actionKey,
  contentKek,
  identityKek,
  CURRENT_CONTENT_VERSION,
  CURRENT_IDENTITY_VERSION,
} from '../tgcloud/lib/keyring.js';

beforeEach(() => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
});

let seq = 1;

function message(text, chatId, extra = {}) {
  return {
    message_id: extra.message_id ?? seq++,
    date: 0,
    chat: { id: chatId, type: 'private' },
    from: { id: chatId, first_name: 'T', language_code: 'en', is_bot: false },
    ...(text === undefined ? {} : { text }),
    ...extra,
  };
}

async function setupLink() {
  await onMessage(message('/start', 100));
  await onMessage(message('/newlink', 100));
  return rawDb().prepare('SELECT * FROM links LIMIT 1').get();
}

test('content, identity, and action keys are distinct domains', async () => {
  assert.notEqual(contentKek(CURRENT_CONTENT_VERSION), identityKek(CURRENT_IDENTITY_VERSION));
  const first = await actionKey({ id: 1 });
  const again = await actionKey({ id: 1 });
  const other = await actionKey({ id: 2 });
  assert.equal(crypto.hex(first), crypto.hex(again));
  assert.notEqual(crypto.hex(first), crypto.hex(other));
  assert.notEqual(crypto.hex(first), contentKek(CURRENT_CONTENT_VERSION));
});

test('a new action token round-trips through openAction', async () => {
  const link = await setupLink();
  const payload = { sender_chat_id: 200, message_id: 7, sender_key: 'k' };
  const now = Math.floor(Date.now() / 1000);
  const sealed = await keys.sealAction(link, 'probe', payload, now, 60);
  const opened = await keys.openAction(sealed.prefix, sealed.suffix);
  assert.deepEqual(opened.payload, payload);
});

test('a legacy link-DEK action token still opens', async () => {
  const link = await setupLink();
  const payload = { sender_chat_id: 200, message_id: 8 };
  const now = Math.floor(Date.now() / 1000);
  const dek = await keys.linkDek(link);
  const sealed = await crypto.encrypt(
    dek,
    JSON.stringify(payload),
    `link:${link.id}:action:legacy:v1`,
  );
  const parts = crypto.split(sealed.ct);
  await store.putActionToken({
    prefix: parts.prefix,
    body: parts.body,
    nonce: sealed.nonce,
    link_id: link.id,
    kind: 'legacy',
    expires_at: now + 60,
  });
  const opened = await keys.openAction(parts.prefix, parts.suffix);
  assert.deepEqual(opened.payload, payload);
});

test('reply targets use the action domain and read old link-DEK rows', async () => {
  const link = await setupLink();
  const first = await keys.sealReplyTarget(link, { chat_id: 200, thread_id: 5 });
  assert.deepEqual(
    await keys.openReplyTarget(link, first.ct, first.nonce),
    { chat_id: 200, thread_id: 5 },
  );

  const dek = await keys.linkDek(link);
  const legacy = await crypto.encrypt(
    dek,
    JSON.stringify({ chat_id: 300, thread_id: 9 }),
    `link:${link.id}:reply:v1`,
  );
  assert.deepEqual(
    await keys.openReplyTarget(link, legacy.ct, legacy.nonce),
    { chat_id: 300, thread_id: 9 },
  );
});

test('an old enc: install salt migrates to the identity domain without changing value', async () => {
  await onMessage(message('/start', 100));
  const salt = 'ab'.repeat(32);
  const sealed = await crypto.encrypt(
    contentKek(CURRENT_CONTENT_VERSION),
    salt,
    'meta:install_salt:v1',
  );
  rawDb().prepare("UPDATE meta SET v = ? WHERE k = 'install_salt'")
    .run(`enc:${CURRENT_CONTENT_VERSION}:${sealed.nonce}:${sealed.ct}`);

  assert.equal(await ownerSalt(), salt);
  assert.match(
    rawDb().prepare("SELECT v FROM meta WHERE k = 'install_salt'").get().v,
    new RegExp(`^id:${CURRENT_IDENTITY_VERSION}:`),
  );
});
