import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Sorted walk, relative path, NUL, bytes. build.js and secret.js are excluded.
// Keep this identical to any external verifier; changing it changes every hash.
export function bundleHash(root) {
  const absolute = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js') && name !== 'build.js' && name !== 'secret.js') {
        absolute.push(path);
      }
    }
  })(root);

  const hash = createHash('sha256');
  for (const file of absolute) {
    hash.update(relative(root, file).split(sep).join('/'));
    hash.update('\0');
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}
