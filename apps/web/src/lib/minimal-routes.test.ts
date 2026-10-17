import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalLocale, minimalPath, formatCoordinates } from './minimal-routes.ts';

test('English is the default and old English deep links remain English', () => {
  for (const path of ['/', '/art/', '/en/', '/en/art/']) assert.equal(minimalLocale(path), 'en');
  for (const path of ['/ru', '/ru/', '/ru/art/']) assert.equal(minimalLocale(path), 'ru');
  for (const locale of ['ru', 'en'] as const) {
    for (const gallery of [false, true]) assert.equal(minimalLocale(minimalPath(locale, gallery)), locale);
  }
});

test('landmark coordinates preserve decimal precision and hemisphere', () => {
  assert.equal(formatCoordinates(28.27305556, -16.63944444), '28.2731° N, 16.6394° W');
  assert.equal(formatCoordinates(-33.86, 151.21), '33.8600° S, 151.2100° E');
});
