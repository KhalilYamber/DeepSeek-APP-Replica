import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { MessageUsage } from '../src/services/api/types.ts'
import type { Session } from '../src/services/chat/types.ts'
import {
  formatTokens,
  latestUsage,
  mergeUsage,
  percentOf,
  usedTokens,
} from '../src/services/contextUsage.ts'

const usage = (patch: Partial<MessageUsage> = {}): MessageUsage => ({
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
  ...patch,
})

test('两段用量合并：后到的 0 不覆盖先到的输入', () => {
  const start = usage({ input_tokens: 1000, cache_read_input_tokens: 500 })
  const delta = usage({ output_tokens: 200 })
  const merged = mergeUsage(start, delta)
  assert.equal(merged?.input_tokens, 1000)
  assert.equal(merged?.cache_read_input_tokens, 500)
  assert.equal(merged?.output_tokens, 200)
})

test('只有一段时原样返回', () => {
  const start = usage({ input_tokens: 10 })
  assert.deepEqual(mergeUsage(undefined, start), start)
  assert.deepEqual(mergeUsage(start, undefined), start)
})

test('已用 = 输入 + 缓存读写 + 输出', () => {
  assert.equal(
    usedTokens(
      usage({
        input_tokens: 100,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 50,
      })
    ),
    200
  )
})

test('百分比：clamp 到 100，没有上限返回 null', () => {
  assert.equal(percentOf(50, 100), 50)
  assert.equal(percentOf(200, 100), 100)
  assert.equal(percentOf(50, null), null)
  assert.equal(percentOf(50, 0), null)
  assert.equal(percentOf(50, undefined), null)
})

test('token 格式化：千、百万', () => {
  assert.equal(formatTokens(999), '999')
  assert.equal(formatTokens(1500), '1.5K')
  assert.equal(formatTokens(1048576), '1.0M')
})

test('取最后一条带用量的回复', () => {
  const session = {
    messages: [
      { role: 'user' },
      { role: 'assistant', usage: usage({ input_tokens: 1 }) },
      { role: 'assistant' },
    ],
  } as unknown as Session
  assert.equal(latestUsage(session)?.input_tokens, 1)
})

test('没有会话或没有用量时返回 undefined', () => {
  assert.equal(latestUsage(undefined), undefined)
  const empty = { messages: [{ role: 'user' }] } as unknown as Session
  assert.equal(latestUsage(empty), undefined)
})
