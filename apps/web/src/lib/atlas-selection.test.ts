import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePostcard, rememberPostcard } from './atlas-selection.ts';

test('a reload cycle visits every available place before repeating', () => {
  const ids = ['castle', 'mountain', 'temple'];
  let recent: string[] = [];
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = choosePostcard(ids, recent, () => .2)!;
    seen.push(id); recent = rememberPostcard(id, ids, recent);
  }
  assert.equal(new Set(seen).size, ids.length);
  assert.notEqual(choosePostcard(ids, recent, () => .2), seen.at(-1));
});
test('a removed place or malformed RNG cannot produce an unavailable selection', () => {
  assert.equal(choosePostcard(['castle'], ['removed'], () => NaN), 'castle');
  assert.deepEqual(rememberPostcard('castle', ['castle', 'temple'], ['removed', 'temple', 'temple']), ['temple', 'castle']);
  assert.equal(choosePostcard([], []), undefined);
});
