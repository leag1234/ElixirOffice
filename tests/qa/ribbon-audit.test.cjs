'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rectsIntersect, isOutsideGroup, labelTooWide } = require('../../tools/qa/ribbon-audit.cjs');

test('rectsIntersect detects overlaps beyond threshold', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 };
  assert.equal(rectsIntersect(a, { left: 5, top: 5, right: 15, bottom: 15 }), true);
  assert.equal(rectsIntersect(a, { left: 10.5, top: 0, right: 20, bottom: 10 }), false);
  assert.equal(rectsIntersect(a, { left: 9, top: 9, right: 20, bottom: 20 }), true);
});

test('isOutsideGroup detects elements outside their group', () => {
  const group = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(isOutsideGroup({ left: 10, top: 10, right: 90, bottom: 90 }, group), false);
  assert.equal(isOutsideGroup({ left: -2, top: 10, right: 90, bottom: 90 }, group), true);
  assert.equal(isOutsideGroup({ left: 10, top: 10, right: 102, bottom: 90 }, group), true);
  assert.equal(isOutsideGroup({ left: 10, top: -2, right: 90, bottom: 90 }, group), true);
  assert.equal(isOutsideGroup({ left: 10, top: 10, right: 90, bottom: 102 }, group), true);
});

test('labelTooWide detects labels wider than their group', () => {
  const group = { left: 0, top: 0, right: 100, bottom: 100, width: 100 };
  assert.equal(labelTooWide({ left: 0, top: 0, right: 99, bottom: 10, width: 99 }, group), false);
  assert.equal(labelTooWide({ left: 0, top: 0, right: 102, bottom: 10, width: 102 }, group), true);
});
