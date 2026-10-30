import { api } from 'sdk';
import * as store from './store.js';
import * as crypto from './crypto.js';
import { CONFIG } from './config.js';
import { KEYS, CURRENT_KEK_VERSION } from './secret.js';

async function sealOwnerSalt(salt) {
  const sealed = await crypto.encrypt(KEYS[CURRENT_KEK_VERSION], salt, 'meta:install_salt:v1');
  return `enc:${CURRENT_KEK_VERSION}:${sealed.nonce}:${sealed.ct}`;
}

// Isolate-local cache: the salt is stable and read on nearly every update.
// shortcut: cached for the isolate lifetime, so a restored database needs an isolate restart.
let saltCache = null;
let usernameCache = null;

async function ownerSalt() {
  if (saltCache) return saltCache;
  const stored = await store.getMeta('install_salt');
  if (!stored) {
    const salt = crypto.randomHex(32);
    await store.setMeta('install_salt', await sealOwnerSalt(salt));
    saltCache = salt;
    return salt;
  }
  if (stored.startsWith('enc:')) {
    const [, version, nonce, ct] = stored.split(':');
    saltCache = await crypto.decrypt(KEYS[Number(version)], ct, nonce, 'meta:install_salt:v1');
    return saltCache;
  }
  await store.setMeta('install_salt', await sealOwnerSalt(stored));
  saltCache = stored;
  return saltCache;
}

export async function userKeyFor(chatId) {
  return crypto.hmacHex(await ownerSalt(), String(chatId));
}

// One lookup per incoming message; HMAC by default, optional PBKDF2 cost barrier.
export async function chatKeyFor(chatId) {
  const salt = await ownerSalt();
  if (CONFIG.kdfIterations <= 0) return crypto.hmacHex(salt, `chat:${chatId}`);
  return crypto.pbkdf2Hex(salt, `chat:${chatId}`, CONFIG.kdfIterations);
}

export function sessionKeyFrom(base) {
  return crypto.hmacHex(base, 'session');
}

export function senderKeyFrom(base, linkId) {
  return crypto.hmacHex(base, `sender:${linkId}`);
}

export async function sessionKeyFor(chatId) {
  return sessionKeyFrom(await chatKeyFor(chatId));
}

export async function senderKeyFor(link, chatId) {
  return senderKeyFrom(await chatKeyFor(chatId), link.id);
}

export async function tokenLookupFor(token) {
  return crypto.hmacHex(await ownerSalt(), `token:${token}`);
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
