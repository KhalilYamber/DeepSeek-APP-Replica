import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveSafeSide } from '../src/app/safeArea.ts'

test('横屏取两侧较大的安全边距', () => {
  assert.equal(resolveSafeSide(44, 0, true), 44)
  assert.equal(resolveSafeSide(0, 44, true), 44)
})

test('两侧相等与两侧都为 0 时原样返回', () => {
  assert.equal(resolveSafeSide(24, 24, true), 24)
  assert.equal(resolveSafeSide(0, 0, true), 0)
})

test('竖屏不镜像，留白交回顶部那条规则', () => {
  assert.equal(resolveSafeSide(44, 0, false), 0)
  assert.equal(resolveSafeSide(0, 44, false), 0)
})
