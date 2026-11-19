import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveThinkingOpen } from '../src/components/messages/thinkingPanel.ts'

const base = { override: undefined, streaming: false, hasResponse: true, end: 'collapse' as const }

test('没手动过、也没在流式：按设置走', () => {
  assert.equal(resolveThinkingOpen(base), false)
  assert.equal(resolveThinkingOpen({ ...base, end: 'expand' }), true)
})

test('正在流式：不管设置，一律展开（不然看不到小窗口）', () => {
  assert.equal(resolveThinkingOpen({ ...base, streaming: true }), true)
  assert.equal(resolveThinkingOpen({ ...base, streaming: true, end: 'expand' }), true)
})

test('没有正文（用户停止 / 出错）：不收起，否则什么都看不到', () => {
  assert.equal(resolveThinkingOpen({ ...base, hasResponse: false }), true)
  assert.equal(resolveThinkingOpen({ ...base, hasResponse: false, end: 'expand' }), true)
})

test('手动收起过：续写时也不自动展开', () => {
  assert.equal(resolveThinkingOpen({ ...base, override: false, streaming: true, end: 'expand' }), false)
})

test('手动收起过：停止生成时也保持收起（手动压过「无正文不收起」）', () => {
  assert.equal(resolveThinkingOpen({ ...base, override: false, hasResponse: false }), false)
})

test('手动展开过：设置改成收起也不跟着收', () => {
  assert.equal(resolveThinkingOpen({ ...base, override: true }), true)
})

test('手动收起过：设置改成展开也不跟着开', () => {
  assert.equal(resolveThinkingOpen({ ...base, override: false, end: 'expand' }), false)
})
