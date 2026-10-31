import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const local = join(repo, 'tgcloud');
const remote = join(repo, '.tgcloud', 'remote');
const manifestPath = join(repo, 'release', 'manifest.json');
const localManifestText = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(localManifestText);
const allowedSigners = join(repo, 'release', 'allowed_signers');
const localSignature = join(repo, 'release', 'manifest.json.sig');
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

// Verify an SSH signature over the exact manifest bytes. The signature is
// written to a temp file because ssh-keygen reads it by path.
function verifySignature(manifestText, signatureText) {
  if (!existsSync(allowedSigners)) return false;
  const dir = mkdtempSync(join(tmpdir(), 'amnpm-sig-'));
  const sigPath = join(dir, 'manifest.json.sig');
  try {
    writeFileSync(sigPath, signatureText);
    execFileSync(
      'ssh-keygen',
      ['-Y', 'verify', '-f', allowedSigners, '-I', 'amnpm-release', '-n', 'release', '-s', sigPath],
      { cwd: repo, input: manifestText, stdio: ['pipe', 'ignore', 'ignore'] },
    );
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
// must also prove both manifests, the deployed stamp, and the release signature.
if (!preflight) {
  check('release manifest is verified', manifest.verified === true, String(manifest.verified));
  check('deployed build is verified', build.verified === true, String(build.verified));
}

if (existsSync(localSignature)) {
  check('release signature verifies', verifySignature(localManifestText, readFileSync(localSignature, 'utf8')));
} else if (preflight) {
  console.log('SKIP  release signature (not signed yet; preflight only)');
} else {
  check('release signature verifies', false, 'release/manifest.json.sig is missing');
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

if (process.argv.includes('--github')) {
  const base = 'https://github.com/411A/AmnPM/releases/latest/download';
  const [manifestResponse, signatureResponse] = await Promise.all([
    fetchText(`${base}/manifest.json`),
    fetchText(`${base}/manifest.json.sig`),
  ]);
  if (!manifestResponse.ok) {
    check('GitHub release manifest reachable', false, `${manifestResponse.status} ${manifestResponse.statusText}`);
  } else {
    const publishedText = manifestResponse.text;
    let published;
    try {
      published = JSON.parse(publishedText);
    } catch {
      published = null;
    }
    if (!published) {
      check('GitHub release manifest is JSON', false);
    } else {
      check('GitHub bundle = deployed bundle', published.bundleHash === remoteHash, published.bundleHash);
      check('GitHub commit = deployed commit', published.commit === build.commit, published.commit);
      check('GitHub manifest = local manifest', publishedText === localManifestText);
      if (!preflight) {
        check('GitHub manifest is verified', published.verified === true, String(published.verified));
      }
      if (signatureResponse.ok) {
        check('GitHub signature verifies', verifySignature(publishedText, signatureResponse.text));
      } else if (preflight) {
        console.log('SKIP  GitHub release signature (not published yet; preflight only)');
      } else {
        check(
          'GitHub release signature reachable',
          false,
          `${signatureResponse.status} ${signatureResponse.statusText}`,
        );
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
