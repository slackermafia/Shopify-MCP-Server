import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('metaobject writes use upsert without deprecated update inputs', () => {
  assert.match(source, /metaobjectUpsert\(/);
  assert.doesNotMatch(source, /MetaobjectUpdateInput/);
  assert.doesNotMatch(source, /metaobjectUpdate\(/);
});

test('staged product images attach through productUpdate', () => {
  assert.match(source, /productUpdate\(product: \$product, media: \$media\)/);
  assert.doesNotMatch(source, /productCreateMedia\(/);
});
