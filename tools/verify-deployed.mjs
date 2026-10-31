import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const local = join(repo, 'tgcloud');
const remote = join(repo, '.tgcloud', 'remote');
const manifest = JSON.parse(readFileSync(join(repo, 'release', 'manifest.json'), 'utf8'));

function bundleHash(root) {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js') && name !== 'build.js' && name !== 'secret.js') files.push(path);
    }
  })(root);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(root, file).split(sep).join('/'));
    hash.update('\0');
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

function deployedBuild() {
  const text = readFileSync(join(remote, 'lib', 'build.js'), 'utf8');
  return JSON.parse(text.match(/export const BUILD = (.+);/)[1]);
}

const checks = [];
const check = (label, ok, detail = '') => checks.push({ label, ok, detail });
const remoteHash = bundleHash(remote);
const localHash = bundleHash(local);
const build = deployedBuild();

check('deployed bundle = release manifest', remoteHash === manifest.bundleHash, remoteHash);
check('local source = release manifest', localHash === manifest.bundleHash, localHash);
check('deployed commit = release commit', build.commit === manifest.commit, build.commit);
check('deployed release = release name', build.release === manifest.release, build.release);

if (process.argv.includes('--github')) {
  const url = 'https://github.com/411A/AmnPM/releases/latest/download/manifest.json';
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    check('GitHub release manifest reachable', false, `${response.status} ${response.statusText}`);
  } else {
    const published = await response.json();
    check('GitHub bundle = deployed bundle', published.bundleHash === remoteHash, published.bundleHash);
    check('GitHub commit = deployed commit', published.commit === build.commit, published.commit);
  }
}

for (const { label, ok, detail } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

if (checks.some((entry) => !entry.ok)) {
  console.error('\nThe deployed code does not match the published source.');
  process.exit(1);
}

console.log(`\nMATCH: running code equals the published source (${remoteHash}).`);
