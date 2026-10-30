// Tunables and deployment values. The KEK lives in the gitignored secret.js.
export const CONFIG = {
  maxLinksPerOwner: 10,
  throttlePerMinute: 30,
  maxAttempts: 5,
  maxMemoLength: 32,
  replyWindowSeconds: 60,
  actionTtlSeconds: 2_592_000,
  modeTtlSeconds: 86_400,
  tokenLength: 10,
  tokenAlphabet: '23456789abcdefghjkmnopqrstuvwxyz',
  defaultMemo: 'main',
  repoUrl: 'https://github.com/411A/AmnPM',
  contactUrl: 'https://t.me/ContactHydraBot',
  manifestUrl: 'https://github.com/411A/AmnPM/releases/latest/download/manifest.json',
};
