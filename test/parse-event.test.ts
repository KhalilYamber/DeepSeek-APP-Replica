import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readMessageEvent } from '../src/services/api/parseEvent.ts'

test('非对象输入一律丢弃', () => {
  for (const value of [null, undefined, 'text', 42, true, []]) {
    assert.equal(readMessageEvent(value), null, `应丢弃 ${JSON.stringify(value)}`)
  }
})

test('未知事件类型静默丢弃，保证前向兼容', () => {
  assert.equal(readMessageEvent({ type: 'brand_new_event_from_the_future' }), null)
  assert.equal(readMessageEvent({ type: undefined }), null)
})

test('message_start 缺 message 时丢弃', () => {
  assert.equal(readMessageEvent({ type: 'message_start' }), null)
  assert.equal(readMessageEvent({ type: 'message_start', message: 'nope' }), null)
})

test('message_start 的 usage 不合法时降级为 undefined，但事件本身保留', () => {
  const parsed = readMessageEvent({
    type: 'message_start',
    message: { id: 'm1', usage: { input_tokens: 'x' } },
  })
  assert.ok(parsed)
  assert.equal((parsed as { message: { usage?: unknown } }).message.usage, undefined)
  assert.equal((parsed as { message: { id: string } }).message.id, 'm1')
})

test('content_block_delta 必须有合法 index 与非空 delta', () => {
  const ok = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'a' } }
  assert.deepEqual(readMessageEvent(ok), ok)

  // 缺 index、负数、非整数一律丢弃——否则会往数组的错误位置写字
  for (const index of [undefined, -1, 1.5, '0']) {
    assert.equal(
      readMessageEvent({ type: 'content_block_delta', index, delta: ok.delta }),
      null,
      `index=${String(index)} 应被丢弃`
    )
  }
})

test('text_delta 缺 text 或 text 非字符串时丢弃', () => {
  for (const delta of [
    { type: 'text_delta' },
    { type: 'text_delta', text: 123 },
    { type: 'text_delta', text: null },
    { type: 'unknown_delta', text: 'a' },
  ]) {
    assert.equal(
      readMessageEvent({ type: 'content_block_delta', index: 0, delta }),
      null,
      `delta=${JSON.stringify(delta)} 应被丢弃`
    )
  }
})

test('content_block_start 的 citations 只保留合法项', () => {
  const parsed = readMessageEvent({
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'text',
      text: 'hi',
      citations: [
        { type: 'web_search_result_location', url: 'https://example.com', title: 'ok' },
        { type: 'web_search_result_location', url: 42 },
        { type: 'other_type', url: 'https://example.com' },
        'garbage',
      ],
    },
  })
  assert.ok(parsed)
  const block = (parsed as { content_block: { citations: unknown[] } }).content_block
  assert.equal(block.citations.length, 1)
})

test('web_search_tool_result 过滤掉不合规的结果项', () => {
  const parsed = readMessageEvent({
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'web_search_tool_result',
      tool_use_id: 't1',
      kind: 'search',
      content: [
        { type: 'web_search_result', url: 'https://a.com', title: 'A' },
        { type: 'web_search_result', url: 'https://b.com' },
        { type: 'web_search_tool_result_error', error_code: 'rate_limited' },
        { type: 'web_search_tool_result_error' },
        null,
      ],
    },
  })
  assert.ok(parsed)
  const content = (parsed as { content_block: { content: unknown[] } }).content_block.content
  assert.equal(content.length, 2)
})

test('message_delta 的 stop_reason 必须属于已知集合', () => {
  const base = { type: 'message_delta', delta: { stop_reason: 'end_turn' } }
  assert.ok(readMessageEvent(base))
  for (const stopReason of ['end_turn_v2', undefined, '', 'END_TURN']) {
    assert.equal(
      readMessageEvent({ type: 'message_delta', delta: { stop_reason: stopReason } }),
      null,
      `stop_reason=${String(stopReason)} 应被丢弃`
    )
  }
})

test('content_block_stop 与 message_stop 原样透传', () => {
  assert.deepEqual(readMessageEvent({ type: 'content_block_stop', index: 2 }), {
    type: 'content_block_stop',
    index: 2,
  })
  assert.deepEqual(readMessageEvent({ type: 'message_stop' }), { type: 'message_stop' })
})
