import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSecret, renderSecret } from '../tools/gen-secret.mjs';

const key = (char) => char.repeat(64);
const base = {
  KEYS: { 2: key('a') },
  CURRENT_KEK_VERSION: 2,
  IDENTITY_KEYS: { 1: key('b') },
  CURRENT_IDENTITY_KEK_VERSION: 1,
  ACTION_KEYS: { 1: key('c') },
  CURRENT_ACTION_KEK_VERSION: 1,
};

test('adding a content version keeps the old version and changes only current', () => {
  const built = buildSecret({
    existing: base,
    env: {
      CONTENT_KEYS_JSON: JSON.stringify({ 3: key('d') }),
      CURRENT_CONTENT_KEK_VERSION: '3',
    },
  });
  assert.deepEqual(Object.keys(built.content.keys).sort(), ['2', '3']);
  assert.equal(built.content.keys[2], key('a'));
  assert.equal(built.content.current, 3);
  assert.equal(built.identity.current, 1);
  assert.equal(built.action.current, 1);
});

test('omitting old versions in .env never drops them', () => {
  const built = buildSecret({
    existing: base,
    env: { CONTENT_KEYS_JSON: JSON.stringify({ 3: key('d') }) },
  });
  assert.deepEqual(Object.keys(built.content.keys).sort(), ['2', '3']);
  assert.equal(built.content.current, 2);
});

test('replacing an existing version key is refused', () => {
  assert.throws(
    () => buildSecret({
      existing: base,
      env: {
        CONTENT_KEYS_JSON: JSON.stringify({ 2: key('d') }),
        CURRENT_CONTENT_KEK_VERSION: '2',
      },
    }),
    /refusing to replace content key version 2/,
  );
});

test('a current version missing from the merged group is refused', () => {
  assert.throws(
    () => buildSecret({
      existing: base,
      env: {
        CONTENT_KEYS_JSON: JSON.stringify({ 3: key('d') }),
        CURRENT_CONTENT_KEK_VERSION: '4',
      },
    }),
    /current content version 4 is not in the merged key group/,
  );
});

test('advancing the identity current version is refused until chat ids are versioned', () => {
  assert.throws(
    () => buildSecret({
      existing: base,
      env: {
        IDENTITY_KEYS_JSON: JSON.stringify({ 2: key('e') }),
        CURRENT_IDENTITY_KEK_VERSION: '2',
      },
    }),
    /refusing to change CURRENT_IDENTITY_KEK_VERSION/,
  );
});

test('a fresh deployment requires --init or explicit content keys', () => {
  assert.throws(
    () => buildSecret({ existing: {}, env: {}, randomKey: () => key('f') }),
    /no existing secret.js and no CONTENT_KEYS_JSON/,
  );
  const built = buildSecret({
    existing: {},
    env: {},
    randomKey: () => key('f'),
    init: true,
  });
  assert.deepEqual(built.content, { keys: { 1: key('f') }, current: 1 });
  assert.deepEqual(built.identity, { keys: { 1: key('f') }, current: 1 });
  assert.deepEqual(built.action, { keys: { 1: key('f') }, current: 1 });
});

test('the generated module exposes all three named groups', () => {
  const body = renderSecret(buildSecret({ existing: base, env: {} }));
  assert.match(body, /export const KEYS =/);
  assert.match(body, /CURRENT_KEK_VERSION = 2/);
  assert.match(body, /export const IDENTITY_KEYS =/);
  assert.match(body, /CURRENT_IDENTITY_KEK_VERSION = 1/);
  assert.match(body, /export const ACTION_KEYS =/);
  assert.match(body, /CURRENT_ACTION_KEK_VERSION = 1/);
});
