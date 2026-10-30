// Tunables and deployment values. The KEK lives in the gitignored secret.js.
export const CONFIG = {
  maxLinksPerOwner: 10,
  throttlePerMinute: 30,
  maxAttempts: 5,
  maxMemoLength: 32,
  actionTtlSeconds: 2_592_000,
  modeTtlSeconds: 86_400,
  tokenLength: 10,
  tokenAlphabet: '23456789abcdefghjkmnopqrstuvwxyz',
  // 0 = fast HMAC lookup. Set >0 for a PBKDF2 cost barrier; changing it invalidates stored keys.
  kdfIterations: 0,
  defaultMemo: 'main',
  repoUrl: 'https://github.com/411A/AmnPM',
  contactUrl: 'https://t.me/AmnPMBot',
  manifestUrl: 'https://github.com/411A/AmnPM/releases/latest/download/manifest.json',
};
