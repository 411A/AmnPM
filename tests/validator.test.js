import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { collectBundle } from '../tools/bundle.mjs';
import { buildValidatorScript, validatorCaption, validatorFileName } from '../tgcloud/lib/validator.js';

const root = fileURLToPath(new URL('../tgcloud/', import.meta.url));

test('validator embeds the exact bundle order and hash', () => {
  const bundle = collectBundle(root);
  const build = {
    commit: 'a'.repeat(40),
    bundleHash: bundle.bundleHash,
    files: bundle.files,
  };
  const script = buildValidatorScript(build, new Date('2026-11-09T00:00:00Z'));
  const target = JSON.parse(script.match(/const TARGET = (.*);/)[1]);

  assert.deepEqual(target.files, bundle.files);
  assert.equal(target.bundleHash, bundle.bundleHash);
  assert.equal(target.commit, build.commit);
  assert.match(script, /cannot inspect the running server/);
  assert.doesNotMatch(script, /require\(/);
  assert.equal(validatorFileName(build), `amnpm-validator-${'a'.repeat(7)}.js`);
  assert.match(validatorCaption('en', new Date('2026-11-09T00:00:00Z'), build), /UTC/);
  assert.match(validatorCaption('fa', new Date('2026-11-09T00:00:00Z'), build), /UTC/);
});
