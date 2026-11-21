import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeDraftKey,
  encodeDraftKey,
  parseDraftRecords,
  serializeDraftRecords,
} from '../src/services/chat/draftStorage.ts'

test('新对话的 key 与真实会话 id 不会互相冒充', () => {
  const encoded = encodeDraftKey(null)
  assert.notEqual(encoded, 'new')
  assert.equal(decodeDraftKey(encoded), null)
  assert.equal(decodeDraftKey(encodeDraftKey('abc')), 'abc')
})

test('往返一趟内容不丢', () => {
  const entries: Array<[string | null, string]> = [
    [null, '新会话的草稿'],
    ['s1', '第一句\n第二句'],
  ]
  assert.deepEqual(parseDraftRecords(serializeDraftRecords(entries)), entries)
})

test('空文本不落盘', () => {
  assert.equal(serializeDraftRecords([['s1', '']]), '{}')
})

test('坏数据一律当没有草稿，不抛错', () => {
  assert.deepEqual(parseDraftRecords(null), [])
  assert.deepEqual(parseDraftRecords(''), [])
  assert.deepEqual(parseDraftRecords('{'), [])
  assert.deepEqual(parseDraftRecords('[]'), [])
  assert.deepEqual(parseDraftRecords('null'), [])
  assert.deepEqual(parseDraftRecords('{"a":1}'), [])
  assert.deepEqual(parseDraftRecords('{"a":""}'), [])
})

test('一条坏值不影响同批其它草稿', () => {
  assert.deepEqual(parseDraftRecords('{"a":"好的","b":2,"c":"也可以"}'), [
    ['a', '好的'],
    ['c', '也可以'],
  ])
})
