// Compiler check for every JavaScript file plus the JSON manifests.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];

for (const dir of ['tgcloud', 'tests', 'tools']) {
  (function walk(path) {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  })(join(root, dir));
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`${relative(root, file)}: ${(result.stderr || result.stdout).trim()}`);
  }
}

for (const file of ['package.json', 'release/manifest.json']) {
  try {
    JSON.parse(readFileSync(join(root, file), 'utf8'));
  } catch (err) {
    failed += 1;
    console.error(`${file}: ${err.message}`);
  }
}

if (failed) {
  console.error(`syntax check failed: ${failed} problem(s)`);
  process.exit(1);
}
console.log(`syntax check ok: ${files.length} JavaScript files, 2 JSON files`);
