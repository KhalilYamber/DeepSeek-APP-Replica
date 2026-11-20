import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pickContextWindow } from '../src/services/contextWindow.ts'

test('按当前模型 id 取上下文上限', () => {
  const models = [
    { id: 'deepseek-flash', context_window: 1048576 },
    { id: 'deepseek-v4-pro', context_window: 262144 },
  ]
  assert.equal(pickContextWindow(models, 'deepseek-flash'), 1048576)
  assert.equal(pickContextWindow(models, 'deepseek-v4-pro'), 262144)
})

test('模型不在清单里返回 null（不拿别人的上限顶替）', () => {
  const models = [{ id: 'deepseek-flash', context_window: 1048576 }]
  assert.equal(pickContextWindow(models, 'deepseek-v4-pro'), null)
})

test('没有 context_window 或值非正时返回 null', () => {
  assert.equal(pickContextWindow([{ id: 'm' }], 'm'), null)
  assert.equal(pickContextWindow([{ id: 'm', context_window: 0 }], 'm'), null)
  assert.equal(pickContextWindow(undefined, 'm'), null)
})
