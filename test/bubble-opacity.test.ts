import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BUBBLE_ALPHA,
  MAX_BUBBLE_ALPHA,
  MIN_BUBBLE_ALPHA,
  parseBubbleAlpha,
} from '../src/services/chatBackground.ts'

test('没存过、或存了坏值，一律回默认 70', () => {
  assert.equal(parseBubbleAlpha(null), DEFAULT_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha(''), DEFAULT_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('abc'), DEFAULT_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('NaN'), DEFAULT_BUBBLE_ALPHA)
})

test('越界夹到 20–90，不会出现全透或全实', () => {
  assert.equal(parseBubbleAlpha('0'), MIN_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('-30'), MIN_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('200'), MAX_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('1000'), MAX_BUBBLE_ALPHA)
})

test('范围内的值原样保留，小数取整', () => {
  assert.equal(parseBubbleAlpha('70'), 70)
  assert.equal(parseBubbleAlpha('20'), MIN_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('90'), MAX_BUBBLE_ALPHA)
  assert.equal(parseBubbleAlpha('63.6'), 64)
})
