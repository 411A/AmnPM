import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Keep this traversal and hashing identical to the validator and gen-build:
// sorted directory walk, relative path, NUL, bytes; build.js and secret.js are
// excluded. Any change here is a bundle-format change.
export function collectBundle(root) {
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

  const files = absolute.map((file) => relative(root, file).split(sep).join('/'));
  const hash = createHash('sha256');
  for (let i = 0; i < files.length; i += 1) {
    hash.update(files[i]);
    hash.update('\0');
    hash.update(readFileSync(absolute[i]));
  }
  return { files, bundleHash: hash.digest('hex') };
}
