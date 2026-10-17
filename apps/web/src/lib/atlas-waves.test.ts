import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasWaves } from './atlas-waves.ts';

test('rapid clicks retain every earlier live wave and its own age', () => {
  const waves = new AtlasWaves();
  for (let i = 0; i < 20; i++) waves.add(.2, .3, i * 30, () => .5);
  const live = waves.sample(1000);
  assert.equal(live.length / 4, 60);
  assert.equal(live[2], 1);
  assert.ok(Math.abs(live[19 * 12 + 2]! - .43) < .0001);
  assert.equal(waves.sample(3300).length / 4, 56);
  assert.equal(waves.sample(5000).length, 0);
});

test('an expired click never clears a later click; clear removes all motion', () => {
  const waves = new AtlasWaves(); waves.add(.2, .3, 0, () => .5); waves.add(.7, .8, 3000, () => .5);
  const live = waves.sample(4000); assert.equal(live.length / 4, 3);
  assert.ok(Math.abs(live[0]! - .7) < .0001); assert.equal(live[2], 1);
  waves.clear(); assert.equal(waves.end, 0); assert.equal(waves.sample(4000).length, 0);
});

test('a burst larger than the initial GPU upload buffer keeps all live clicks', () => {
  const waves = new AtlasWaves();
  for (let i = 0; i < 100; i++) waves.add(.4, .6, i * 8, () => .5);
  assert.equal(waves.sample(1000).length / 4, 300);
  assert.equal(waves.sample(6000).length, 0);
});
