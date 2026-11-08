import { api } from 'sdk';
import * as store from './store.js';
import * as crypto from './crypto.js';
import { CONFIG } from './config.js';
import { contentKek, identityKek, CURRENT_IDENTITY_VERSION } from './keyring.js';

async function sealOwnerSalt(salt) {
  const sealed = await crypto.encrypt(
    identityKek(CURRENT_IDENTITY_VERSION),
    salt,
    'meta:install_salt:v1',
  );
  return `id:${CURRENT_IDENTITY_VERSION}:${sealed.nonce}:${sealed.ct}`;
}

async function openOwnerSalt(stored) {
  const [tag, version, nonce, ct] = String(stored).split(':');
  if (tag === 'id') {
    return crypto.decrypt(identityKek(Number(version)), ct, nonce, 'meta:install_salt:v1');
  }
  if (tag === 'enc') {
    // Pre-domain rows were wrapped with the content KEK. The salt value itself
    // does not change, so every derived owner/sender/link key stays valid.
    const salt = await crypto.decrypt(contentKek(Number(version)), ct, nonce, 'meta:install_salt:v1');
    await store.setMeta('install_salt', await sealOwnerSalt(salt));
    return salt;
  }
  // Legacy plaintext salt.
  await store.setMeta('install_salt', await sealOwnerSalt(String(stored)));
  return String(stored);
}

// Read from the database on every derivation: a restored or reset database must
// never reuse a salt cached in a surviving isolate.
let usernameCache = null;

export async function ownerSalt() {
  const stored = await store.getMeta('install_salt');
  if (!stored) {
    // The first writer wins; every isolate must use the same installation salt.
    const salt = crypto.randomHex(32);
    await store.insertMetaIfAbsent('install_salt', await sealOwnerSalt(salt));
    const winner = await store.getMeta('install_salt');
    return openOwnerSalt(winner);
  }
  return openOwnerSalt(stored);
}

// Each handler reads the salt once and passes it to every derivation, so one
// update never pays for the same meta row more than once.
export async function userKeyFor(chatId, salt = null) {
  return crypto.hmacHex(salt ?? await ownerSalt(), String(chatId));
}

// One lookup per incoming message; HMAC by default, optional PBKDF2 cost barrier.
export async function chatKeyFor(chatId, salt = null) {
  const key = salt ?? await ownerSalt();
  if (CONFIG.kdfIterations <= 0) return crypto.hmacHex(key, `chat:${chatId}`);
  return crypto.pbkdf2Hex(key, `chat:${chatId}`, CONFIG.kdfIterations);
}

export function sessionKeyFrom(base) {
  return crypto.hmacHex(base, 'session');
}

export function senderKeyFrom(base, linkId) {
  return crypto.hmacHex(base, `sender:${linkId}`);
}

export async function sessionKeyFor(chatId, salt = null) {
  return sessionKeyFrom(await chatKeyFor(chatId, salt));
}

export async function senderKeyFor(link, chatId, salt = null) {
  return senderKeyFrom(await chatKeyFor(chatId, salt), link.id);
}

export async function tokenLookupFor(token, salt = null) {
  return crypto.hmacHex(salt ?? await ownerSalt(), `token:${token}`);
}

export async function botUsername() {
  if (usernameCache) return usernameCache;
  const cached = await store.getMeta('bot_username');
  if (cached) {
    usernameCache = cached;
    return cached;
  }
  const me = await api.getMe();
  usernameCache = me.username;
  await store.setMeta('bot_username', me.username);
  return usernameCache;
}

export async function deepLink(token) {
  return `https://t.me/${await botUsername()}?start=${token}`;
}
