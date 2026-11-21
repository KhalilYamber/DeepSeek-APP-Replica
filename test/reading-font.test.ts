import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickReadingLevel,
  READING_LEVELS,
  READING_SCALES,
} from '../src/services/readingFont.ts'

test('认不出的档位一律回标准，坏数据不会把界面缩没', () => {
  assert.equal(pickReadingLevel(null), 'normal')
  assert.equal(pickReadingLevel(''), 'normal')
  assert.equal(pickReadingLevel('huge'), 'normal')
  assert.equal(pickReadingLevel('1.25'), 'normal')
})

test('四个合法档位原样返回', () => {
  for (const level of READING_LEVELS) {
    assert.equal(pickReadingLevel(level), level)
  }
})

test('系数随档位单调递增，且标准档是 1', () => {
  assert.equal(READING_SCALES.normal, 1)
  assert.ok(READING_SCALES.small < READING_SCALES.normal)
  assert.ok(READING_SCALES.normal < READING_SCALES.large)
  assert.ok(READING_SCALES.large < READING_SCALES.xlarge)
})

test('小档不低于 0.8、特大档不高于 1.3——再大就会把窄屏布局挤坏', () => {
  assert.ok(READING_SCALES.small >= 0.8)
  assert.ok(READING_SCALES.xlarge <= 1.3)
})
