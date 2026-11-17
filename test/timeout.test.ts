import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CONNECT_TIMEOUT_MS,
  FIRST_BYTE_TIMEOUT_MS,
  MAX_REQUEST_ATTEMPTS,
  RETRY_DELAY_MS,
  STREAM_IDLE_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  linkAbort,
  noteStreamEvent,
  notifyRequestRetry,
  onRequestRetry,
  shouldRetry,
  startStreamWatch,
  timeoutMessage,
  timeoutMs,
} from '../src/services/api/timeout.ts'

test('三段超时按各自阈值：连接 5 秒、首字节 30 秒、流空闲 60 秒', () => {
  assert.equal(timeoutMs('connect'), 5_000)
  assert.equal(timeoutMs('firstByte'), 30_000)
  assert.equal(timeoutMs('stream'), 60_000)
  assert.equal(CONNECT_TIMEOUT_MS, 5_000)
  assert.equal(FIRST_BYTE_TIMEOUT_MS, 30_000)
  assert.equal(STREAM_IDLE_TIMEOUT_MS, 60_000)
  // 上传要先把请求体写完，边界必须比「连接」宽，否则正常的大文件上传会被判成超时
  assert.ok(UPLOAD_TIMEOUT_MS > CONNECT_TIMEOUT_MS)
})

test('超时文案带上实际秒数：三段各对应自己的词条，上传按自己的预算算', () => {
  assert.deepEqual(timeoutMessage('connect'), {
    key: 'requestTimeout',
    params: { seconds: 5 },
  })
  assert.deepEqual(timeoutMessage('firstByte'), {
    key: 'firstByteTimeout',
    params: { seconds: 30 },
  })
  assert.deepEqual(timeoutMessage('stream'), {
    key: 'streamIdleTimeout',
    params: { seconds: 60 },
  })
  assert.deepEqual(timeoutMessage('connect', UPLOAD_TIMEOUT_MS), {
    key: 'requestTimeout',
    params: { seconds: 120 },
  })
})

test('合并 signal：调用方中止会连上本次请求的 controller', () => {
  const caller = new AbortController()
  const request = new AbortController()
  const unlink = linkAbort(caller.signal, request)
  caller.abort()
  assert.equal(request.signal.aborted, true)
  unlink()
})

test('合并 signal：本次请求自己的中止（超时）不会反噬调用方', () => {
  const caller = new AbortController()
  const request = new AbortController()
  const unlink = linkAbort(caller.signal, request)
  request.abort()
  assert.equal(caller.signal.aborted, false)
  unlink()
})

test('合并 signal：解绑之后调用方再中止也不牵连上一次的 controller', () => {
  const caller = new AbortController()
  const request = new AbortController()
  const unlink = linkAbort(caller.signal, request)
  unlink()
  caller.abort()
  assert.equal(request.signal.aborted, false)
})

test('合并 signal：调用方已经中止时立刻跟着中止；没有 signal 时解绑是空操作', () => {
  const caller = new AbortController()
  caller.abort()
  const request = new AbortController()
  linkAbort(caller.signal, request)()
  assert.equal(request.signal.aborted, true)

  const noSignal = new AbortController()
  linkAbort(undefined, noSignal)()
  assert.equal(noSignal.signal.aborted, false)
})

test('流式看门狗：收到第一个事件之前按首字节阈值，之后按空闲阈值', () => {
  const start = startStreamWatch()
  assert.equal(start.events, 0)
  assert.equal(start.deadline, 'firstByte')
  assert.equal(timeoutMs(start.deadline), FIRST_BYTE_TIMEOUT_MS)

  const afterOne = noteStreamEvent(start)
  assert.equal(afterOne.events, 1)
  assert.equal(afterOne.deadline, 'stream')
  assert.equal(timeoutMs(afterOne.deadline), STREAM_IDLE_TIMEOUT_MS)

  const afterMany = noteStreamEvent(noteStreamEvent(afterOne))
  assert.equal(afterMany.events, 3)
  assert.equal(afterMany.deadline, 'stream')
})

test('重试策略：连接失败、429、5xx 各重试一次', () => {
  assert.equal(MAX_REQUEST_ATTEMPTS, 2)
  assert.equal(RETRY_DELAY_MS, 1_000)
  assert.equal(shouldRetry({ attempt: 0, failure: 'network' }), true)
  assert.equal(shouldRetry({ attempt: 0, failure: 'http', status: 429 }), true)
  assert.equal(shouldRetry({ attempt: 0, failure: 'http', status: 500 }), true)
  assert.equal(shouldRetry({ attempt: 0, failure: 'http', status: 503 }), true)
})

test('重试策略：最多一次，超时与主动停止不重试', () => {
  assert.equal(shouldRetry({ attempt: 1, failure: 'network' }), false)
  assert.equal(shouldRetry({ attempt: 1, failure: 'http', status: 500 }), false)
  assert.equal(shouldRetry({ attempt: 0, failure: 'timeout' }), false)
  assert.equal(shouldRetry({ attempt: 0, failure: 'aborted' }), false)
})

test('重试策略：参数、鉴权、余额、附件过大这类错误重试无用', () => {
  for (const status of [400, 401, 402, 413, 404]) {
    assert.equal(shouldRetry({ attempt: 0, failure: 'http', status }), false)
  }
  assert.equal(shouldRetry({ attempt: 0, failure: 'http' }), false)
})

test('重试提示只通知当前订阅者，退回订阅后不再收到', () => {
  let calls = 0
  const off = onRequestRetry(() => {
    calls += 1
  })
  notifyRequestRetry()
  assert.equal(calls, 1)
  off()
  notifyRequestRetry()
  assert.equal(calls, 1)
})
