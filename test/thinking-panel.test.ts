import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveThinkingOpen } from '../src/components/messages/thinkingPanel.ts'

test('没手动过、也没在流式：按设置走', () => {
  assert.equal(resolveThinkingOpen({ override: undefined, streaming: false, end: 'collapse' }), false)
  assert.equal(resolveThinkingOpen({ override: undefined, streaming: false, end: 'expand' }), true)
})

test('正在流式：不管设置，一律展开（不然看不到小窗口）', () => {
  assert.equal(resolveThinkingOpen({ override: undefined, streaming: true, end: 'collapse' }), true)
  assert.equal(resolveThinkingOpen({ override: undefined, streaming: true, end: 'expand' }), true)
})

test('手动收起过：续写时也不自动展开', () => {
  assert.equal(resolveThinkingOpen({ override: false, streaming: true, end: 'expand' }), false)
})

test('手动展开过：设置改成收起也不跟着收', () => {
  assert.equal(resolveThinkingOpen({ override: true, streaming: false, end: 'collapse' }), true)
})

test('手动收起过：设置改成展开也不跟着开', () => {
  assert.equal(resolveThinkingOpen({ override: false, streaming: false, end: 'expand' }), false)
})

test('手动状态压过流式判断（收起了就一直收着）', () => {
  assert.equal(resolveThinkingOpen({ override: false, streaming: true, end: 'collapse' }), false)
  assert.equal(resolveThinkingOpen({ override: true, streaming: true, end: 'collapse' }), true)
})
