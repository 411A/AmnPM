import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../tgcloud/', import.meta.url));

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (name.endsWith('.js')) files.push(path);
  }
  return files;
}

// A spying line should be a visible diff that fails CI, not something buried in a handler.
test('application source has no logging, environment reads, or outbound network calls', () => {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /\bconsole\s*\./, `${file}: console`);
    assert.doesNotMatch(text, /\bprocess\s*\.\s*(stdout|stderr|env)\b/, `${file}: process`);
    assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/, `${file}: network`);
    assert.doesNotMatch(text, /\brequire\s*\(/, `${file}: require`);
    assert.doesNotMatch(
      text,
      /from\s+['"](node:)?(fs|http|https|net|tls|dgram|child_process)['"]/,
      `${file}: node network/fs`,
    );
  }
});
