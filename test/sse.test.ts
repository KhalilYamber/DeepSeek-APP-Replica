import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ServerSentEventDecoder } from '../src/services/api/sse.ts'

/** 按给定分片喂入，返回派发出来的全部事件，末尾调 end() 收尾 */
const feed = (chunks: string[]) => {
  const decoder = new ServerSentEventDecoder()
  const events = chunks.flatMap((chunk) => decoder.push(chunk))
  return [...events, ...decoder.end()]
}

test('一个完整事件：空行派发，缺省 event 为 message', () => {
  assert.deepEqual(feed(['data: hi\n\n']), [{ event: 'message', data: 'hi', lastEventId: '' }])
})

test('多行 data 以换行连接', () => {
  assert.deepEqual(feed(['data: a\ndata: b\n\n']), [
    { event: 'message', data: 'a\nb', lastEventId: '' },
  ])
})

test('一个分片里可派发多个事件', () => {
  assert.deepEqual(feed(['data: a\n\ndata: b\n\n']), [
    { event: 'message', data: 'a', lastEventId: '' },
    { event: 'message', data: 'b', lastEventId: '' },
  ])
})

test('事件被切成两片时仍能拼回', () => {
  assert.deepEqual(feed(['data: hel', 'lo\n\n']), [
    { event: 'message', data: 'hello', lastEventId: '' },
  ])
})

test('CRLF 被正确切分，跨片的 CRLF 不会漏掉事件', () => {
  assert.deepEqual(feed(['data: hi\r\n\r\ndata: ok\r\n\r\n']), [
    { event: 'message', data: 'hi', lastEventId: '' },
    { event: 'message', data: 'ok', lastEventId: '' },
  ])
  // 结尾孤立的 CR 是 CRLF 的前半，要等下一片，不能当成完整换行消费掉
  assert.deepEqual(feed(['data: hi\r', '\n\r\n']), [
    { event: 'message', data: 'hi', lastEventId: '' },
  ])
})

test('注释行被忽略', () => {
  assert.deepEqual(feed([': keep-alive\n\n']), [])
  assert.deepEqual(feed([': keep-alive\ndata: x\n\n']), [
    { event: 'message', data: 'x', lastEventId: '' },
  ])
})

test('event 与 id 字段生效，且 lastEventId 跨事件保留', () => {
  assert.deepEqual(feed(['event: ping\nid: 7\ndata: x\n\n']), [
    { event: 'ping', data: 'x', lastEventId: '7' },
  ])
  const decoder = new ServerSentEventDecoder()
  assert.deepEqual(decoder.push('id: 7\ndata: a\n\n'), [
    { event: 'message', data: 'a', lastEventId: '7' },
  ])
  // 第二个事件没有 id 字段，但按规范应沿用上一个 id
  assert.deepEqual(decoder.push('data: b\n\n'), [
    { event: 'message', data: 'b', lastEventId: '7' },
  ])
})

test('没有 data 的空行不派发事件', () => {
  assert.deepEqual(feed(['\n\n\n']), [])
  assert.deepEqual(feed(['event: ping\n\n']), [])
})

test('值前的单个空格被剥掉，且字段可以没有冒号', () => {
  assert.deepEqual(feed(['data:x\n\n']), [{ event: 'message', data: 'x', lastEventId: '' }])
  assert.deepEqual(feed(['data:  x\n\n']), [{ event: 'message', data: ' x', lastEventId: '' }])
  // `data` 裸字段等价于空值
  assert.deepEqual(feed(['data\n\n']), [{ event: 'message', data: '', lastEventId: '' }])
})

test('流未以空行结尾时，事件按规范丢弃', () => {
  assert.deepEqual(feed(['data: never-dispatched\n']), [])
})
