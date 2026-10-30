import { CONFIG } from './config.js';
import { WORDS } from './words.js';
import { hmacBytes, randomBytes, sha256Fp } from './crypto.js';

if (CONFIG.tokenAlphabet.length !== 32) {
  throw new Error('tokenAlphabet must contain exactly 32 symbols');
}

export function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(CONFIG.tokenLength));
  let token = '';
  for (const byte of bytes) token += CONFIG.tokenAlphabet[byte & 31];
  return token;
}

export function tokenFp(token) {
  return sha256Fp(token);
}

export function sanitizeMemo(input) {
  const memo = String(input ?? '').replace(/\s+/g, ' ').trim();
  return memo ? memo.slice(0, CONFIG.maxMemoLength) : CONFIG.defaultMemo;
}

export async function makeIndicator(salt, firstName) {
  const digest = await hmacBytes(salt, `indicator:${firstName ?? ''}`);
  const i = ((digest[0] << 8) | digest[1]) % WORDS.length;
  const j = ((digest[2] << 8) | digest[3]) % WORDS.length;
  return `${WORDS[i]}-${WORDS[j]}`;
}

export function cleanLabel(text, max = 40) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function newSalt() {
  return Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
}
