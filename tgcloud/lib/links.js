import { api } from 'sdk';
import * as store from './store.js';
import * as crypto from './crypto.js';
import { KEYS, CURRENT_KEK_VERSION } from './secret.js';

async function sealOwnerSalt(salt) {
  const sealed = await crypto.encrypt(KEYS[CURRENT_KEK_VERSION], salt, 'meta:install_salt:v1');
  return `enc:${CURRENT_KEK_VERSION}:${sealed.nonce}:${sealed.ct}`;
}

async function ownerSalt() {
  const stored = await store.getMeta('install_salt');
  if (!stored) {
    const salt = crypto.randomHex(32);
    await store.setMeta('install_salt', await sealOwnerSalt(salt));
    return salt;
  }
  if (stored.startsWith('enc:')) {
    const [, version, nonce, ct] = stored.split(':');
    return crypto.decrypt(KEYS[Number(version)], ct, nonce, 'meta:install_salt:v1');
  }
  await store.setMeta('install_salt', await sealOwnerSalt(stored));
  return stored;
}

export async function userKeyFor(chatId) {
  return crypto.hmacHex(await ownerSalt(), String(chatId));
}

export async function botUsername() {
  const cached = await store.getMeta('bot_username');
  if (cached) return cached;
  const me = await api.getMe();
  await store.setMeta('bot_username', me.username);
  return me.username;
}

export async function deepLink(token) {
  return `https://t.me/${await botUsername()}?start=${token}`;
}
