import assert from 'node:assert/strict'
import { test } from 'node:test'

import { jsonClone } from '../src/app/polyfills.ts'

test('纯对象与数组是深拷贝，改副本不影响原件', () => {
  const source = { model: 'deepseek-chat', list: [1, 2] }
  const copy = jsonClone(source)
  assert.deepEqual(copy, source)
  assert.notEqual(copy, source)
  assert.notEqual(copy.list, source.list)
})

test('已知局限：Date 变字符串、undefined 属性丢失（mermaid 只克隆纯配置，故可接受）', () => {
  const source: Record<string, unknown> = { at: new Date(0), maybe: undefined }
  assert.deepEqual(jsonClone(source), { at: new Date(0).toISOString() })
})
