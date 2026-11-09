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
    const target = file.replace(/\\/g, '/');
    let text = readFileSync(file, 'utf8');
    // validator.js embeds a user-side Node script as a string. It is data, not
    // runtime code; scan only the wrapper that sends it. The generated script
    // is checked by tests/validator.test.js.
    if (target.endsWith('/lib/validator.js')) {
      text = text.replace(/\n  return `[\s\S]*?\n`;\n}/, '\n  return "";\n}');
    }
    // words.js is word data, not code: a listed word such as "console" is not a call.
    if (!file.replace(/\\/g, '/').endsWith('/lib/words.js')) {
      assert.doesNotMatch(text, /\bconsole\b/, `${file}: console`);
    }
    assert.doesNotMatch(text, /\bprocess\b/, `${file}: process`);
    assert.doesNotMatch(text, /\bglobalThis\b/, `${file}: globalThis`);
    assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, `${file}: network`);
    assert.doesNotMatch(text, /(\bimport\s*\(|\bimport\s+['"])/, `${file}: dynamic/bare import`);
    assert.doesNotMatch(text, /\b(eval\s*\(|Function\s*\()/, `${file}: dynamic code`);
    assert.doesNotMatch(text, /\brequire\s*\(/, `${file}: require`);
    assert.doesNotMatch(
      text,
      /['"](node:)[^'"]*['"]/,
      `${file}: node: import`,
    );
    assert.doesNotMatch(
      text,
      /from\s+['"](fs|http|https|net|tls|dgram|child_process|worker_threads|vm|module|inspector|http2|dns|os|fs\/promises)(['"/])/,
      `${file}: node network/fs`,
    );
  }
});
