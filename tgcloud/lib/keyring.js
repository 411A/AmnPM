import * as secret from './secret.js';
import * as c from './crypto.js';

// Three named key domains. The fallbacks keep an older secret.js working while
// the deployment is migrated; a fully named secret gets real separation.
const CONTENT_KEYS = secret.KEYS ?? {};
const CONTENT_VERSION = Number(secret.CURRENT_KEK_VERSION);
const IDENTITY_KEYS = secret.IDENTITY_KEYS ?? CONTENT_KEYS;
const IDENTITY_VERSION = Number(
  secret.CURRENT_IDENTITY_KEK_VERSION ?? CONTENT_VERSION,
);
const ACTION_KEYS = secret.ACTION_KEYS ?? CONTENT_KEYS;
const ACTION_VERSION = Number(secret.CURRENT_ACTION_KEK_VERSION ?? CONTENT_VERSION);

function validate(name, keys) {
  for (const [version, key] of Object.entries(keys)) {
    if (typeof key !== 'string' || !/^[0-9a-fA-F]{64}$/.test(key) || /^0+$/.test(key)) {
      throw new Error(`${name} ${version} must be 32 nonzero bytes of hex`);
    }
  }
}

validate('content KEK', CONTENT_KEYS);
validate('identity KEK', IDENTITY_KEYS);
validate('action KEK', ACTION_KEYS);
if (!CONTENT_KEYS[CONTENT_VERSION]) {
  throw new Error(`missing current content KEK version ${CONTENT_VERSION}`);
}
if (!IDENTITY_KEYS[IDENTITY_VERSION]) {
  throw new Error(`missing current identity KEK version ${IDENTITY_VERSION}`);
}
if (!ACTION_KEYS[ACTION_VERSION]) {
  throw new Error(`missing current action KEK version ${ACTION_VERSION}`);
}

export function contentKek(version) {
  const key = CONTENT_KEYS[version];
  if (!key) throw new Error(`unknown content KEK version ${version}`);
  return key;
}

export function identityKek(version) {
  const key = IDENTITY_KEYS[version];
  if (!key) throw new Error(`unknown identity KEK version ${version}`);
  return key;
}

export async function actionKey(link, version = ACTION_VERSION) {
  const kek = ACTION_KEYS[version];
  if (!kek) throw new Error(`unknown action KEK version ${version}`);
  return c.hmacBytes(kek, `action-key:${link.id}`);
}

// Newest first; openAction also falls back to the legacy link DEK.
export function actionKeyVersions() {
  return Object.keys(ACTION_KEYS).map(Number).sort((a, b) => b - a);
}

export const CURRENT_CONTENT_VERSION = CONTENT_VERSION;
export const CURRENT_IDENTITY_VERSION = IDENTITY_VERSION;
export const CURRENT_ACTION_VERSION = ACTION_VERSION;
