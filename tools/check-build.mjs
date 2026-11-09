// Fails if the checked-in build stamp is stale. Run in CI and before deploy.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectBundle } from './bundle.mjs';

const root = fileURLToPath(new URL('../tgcloud/', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url));
const { files, bundleHash } = collectBundle(root);
const build = (await import(pathToFileURL(`${root}lib/build.js`).href)).BUILD;
const manifest = JSON.parse(readFileSync(`${repo}release/manifest.json`, 'utf8'));

const problems = [];
if (build.bundleHash !== bundleHash) problems.push('build.js bundleHash is stale');
if (build.commit !== manifest.commit) problems.push('build.js commit differs from manifest');
if (build.bundleHash !== manifest.bundleHash) problems.push('build.js hash differs from manifest');
if (build.verified !== true) problems.push('build.js is not verified');
if (manifest.verified !== true) problems.push('manifest is not verified');
if (!Array.isArray(build.files)) problems.push('build.js has no file list');
else if (JSON.stringify(build.files) !== JSON.stringify(files)) {
  problems.push('build.js file list differs from the source tree');
}

if (problems.length) {
  for (const problem of problems) console.error(`build check: ${problem}`);
  process.exit(1);
}
console.log(`build check ok: ${files.length} files, ${bundleHash}`);
