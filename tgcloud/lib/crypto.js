const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    if (b === undefined) break;
    out += B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    if (c === undefined) break;
    out += B64[c & 63];
  }
  return out;
}

export function unb64url(text) {
  const out = [];
  let value = 0;
  let bits = 0;
  for (const ch of text) {
    const index = B64.indexOf(ch);
    if (index < 0) throw new Error('invalid base64url');
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}

export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function unhex(text) {
  if (text.length % 2) throw new Error('invalid hex');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function keyBytes(key) {
  return typeof key === 'string' ? unhex(key) : key;
}

export function randomBytes(size) {
  return crypto.getRandomValues(new Uint8Array(size));
}

export function randomHex(size) {
  return hex(randomBytes(size));
}

async function aesKey(key) {
  return crypto.subtle.importKey('raw', keyBytes(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(key, plaintext, aad) {
  const iv = randomBytes(12);
  const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    await aesKey(key),
    data,
  );
  return { ct: b64url(new Uint8Array(cipher)), nonce: b64url(iv) };
}

export async function decryptBytes(key, ct, nonce, aad) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64url(nonce), additionalData: enc.encode(aad) },
    await aesKey(key),
    unb64url(ct),
  );
  return new Uint8Array(plain);
}

export async function decrypt(key, ct, nonce, aad) {
  return dec.decode(await decryptBytes(key, ct, nonce, aad));
}

export async function hmacBytes(key, text) {
  const k = await crypto.subtle.importKey(
    'raw',
    keyBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}

export async function hmacHex(key, text) {
  return hex(await hmacBytes(key, text));
}

export async function sha256Fp(text, bytes = 8) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return hex(digest.slice(0, bytes));
}

// Ciphertext is split so the database never holds the last 12 characters.
export function split(ct) {
  if (ct.length < 30) throw new Error('ciphertext too short to split');
  return { prefix: ct.slice(0, 12), body: ct.slice(0, -12), suffix: ct.slice(-12) };
}

export function join(body, suffix) {
  return body + suffix;
}
