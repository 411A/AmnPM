import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const local = join(repo, 'tgcloud');
const remote = join(repo, '.tgcloud', 'remote');
const localManifestText = readFileSync(join(repo, 'release', 'manifest.json'), 'utf8');
const manifest = JSON.parse(localManifestText);
const preflight = process.argv.includes('--preflight');

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

async function fetchText(url, attempts = 4) {
  let last = { ok: false, status: 0, statusText: 'fetch failed', text: '' };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // GitHub's release-asset CDN can briefly return 404 after an upload; a
    // fresh cache-buster and a short backoff make the retry hit a current edge.
    const target = `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}-${attempt}`;
    try {
      const response = await fetch(target, { redirect: 'follow' });
      last = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text: response.ok ? await response.text() : '',
      };
      if (response.ok) return last;
    } catch (err) {
      last = { ok: false, status: 0, statusText: String(err?.cause?.code ?? err?.message ?? err), text: '' };
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  return last;
}

const checks = [];
const check = (label, ok, detail = '') => checks.push({ label, ok, detail });
const remoteHash = bundleHash(remote);
const localHash = bundleHash(local);
const build = deployedBuild();

check('deployed bundle = release manifest', remoteHash === manifest.bundleHash, remoteHash);
check('local source = release manifest', localHash === manifest.bundleHash, localHash);
check('deployed build hash = release manifest', build.bundleHash === manifest.bundleHash, build.bundleHash);
check('deployed commit = release commit', build.commit === manifest.commit, build.commit);
check('deployed release = release name', build.release === manifest.release, build.release);

// The first pass proves the hashes before the build is stamped; the final pass
// must also prove the manifests and the deployed stamp say verified.
if (!preflight) {
  check('release manifest is verified', manifest.verified === true, String(manifest.verified));
  check('deployed build is verified', build.verified === true, String(build.verified));
}

if (process.argv.includes('--github')) {
  const response = await fetchText('https://github.com/411A/AmnPM/releases/latest/download/manifest.json');
  if (!response.ok) {
    check('GitHub release manifest reachable', false, `${response.status} ${response.statusText}`);
  } else {
    let published;
    try {
      published = JSON.parse(response.text);
    } catch {
      published = null;
    }
    if (!published) {
      check('GitHub release manifest is JSON', false);
    } else {
      check('GitHub bundle = deployed bundle', published.bundleHash === remoteHash, published.bundleHash);
      check('GitHub commit = deployed commit', published.commit === build.commit, published.commit);
      check('GitHub manifest = local manifest', response.text === localManifestText);
      if (!preflight) {
        check('GitHub manifest is verified', published.verified === true, String(published.verified));
      }
    }
  }
}

for (const { label, ok, detail } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

if (checks.some((entry) => !entry.ok)) {
  console.error('\nThe deployed code does not match the published source.');
  process.exit(1);
}

console.log(`\n${preflight ? 'PREFLIGHT MATCH' : 'MATCH'}: running code equals the published source (${remoteHash}).`);
