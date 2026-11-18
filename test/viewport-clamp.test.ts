import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveFrameOverride } from '../src/app/viewportClamp.ts'

const H = 844

test('没有 visualViewport 或没有键盘：交回 CSS', () => {
  assert.deepEqual(resolveFrameOverride({ innerHeight: H }), { mode: 'css' })
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: H }), { mode: 'css' })
})

test('键盘弹出时钉在视觉视口上，top 为 0', () => {
  const decision = resolveFrameOverride({ innerHeight: H, visualHeight: 430, offsetTop: 0 })
  assert.deepEqual(decision, { mode: 'pin', height: 430, top: 0 })
})

test('iOS 式：视觉视口被推下去时按 offsetTop 平移', () => {
  const decision = resolveFrameOverride({ innerHeight: H, visualHeight: 430, offsetTop: 120 })
  assert.deepEqual(decision, { mode: 'pin', height: 430, top: 120 })
})

test('offsetTop 越界或为负都夹回 [0, innerHeight - height]', () => {
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 430, offsetTop: 999 }), {
    mode: 'pin',
    height: 430,
    top: H - 430,
  })
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 430, offsetTop: -50 }), {
    mode: 'pin',
    height: 430,
    top: 0,
  })
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 430, offsetTop: NaN }), {
    mode: 'pin',
    height: 430,
    top: 0,
  })
})

test('读数不可信时一律交回 CSS，不照着写', () => {
  // 旧内核会报 0
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 0 }), { mode: 'css' })
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: NaN }), { mode: 'css' })
  // 布局视口读数本身是坏的
  assert.deepEqual(resolveFrameOverride({ innerHeight: 0, visualHeight: 0 }), { mode: 'css' })
  assert.deepEqual(resolveFrameOverride({ innerHeight: NaN, visualHeight: 400 }), { mode: 'css' })
  // 只剩四分之一不到：不可能是键盘，是坏读数
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 100 }), { mode: 'css' })
})

test('只是地址栏 / 工具栏在挤（高于 75%）时不接管', () => {
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: H - 60 }), { mode: 'css' })
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 640 }), { mode: 'css' })
})

test('双指缩放期间保持现状，不改布局', () => {
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 430, scale: 1.5 }), {
    mode: 'keep',
  })
  // scale 恰好是 1 时按正常流程走
  assert.deepEqual(resolveFrameOverride({ innerHeight: H, visualHeight: 430, scale: 1 }), {
    mode: 'pin',
    height: 430,
    top: 0,
  })
})

test('返回值都是整数像素', () => {
  const decision = resolveFrameOverride({ innerHeight: 844.6, visualHeight: 430.4, offsetTop: 12.7 })
  assert.ok(decision.mode === 'pin')
  assert.equal(Number.isInteger(decision.height), true)
  assert.equal(Number.isInteger(decision.top), true)
})
