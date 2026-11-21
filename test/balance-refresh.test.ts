import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onBalanceRefresh, requestBalanceRefresh } from '../src/services/balanceRefresh.ts'

test('订阅后收到刷新通知', () => {
  let count = 0
  const off = onBalanceRefresh(() => {
    count += 1
  })
  requestBalanceRefresh()
  requestBalanceRefresh()
  off()
  assert.equal(count, 2)
})

test('退订之后不再收到', () => {
  let count = 0
  const off = onBalanceRefresh(() => {
    count += 1
  })
  off()
  requestBalanceRefresh()
  assert.equal(count, 0)
})

test('重复退订是空操作，后来的订阅者不受影响', () => {
  let first = 0
  let second = 0
  const offFirst = onBalanceRefresh(() => {
    first += 1
  })
  const offSecond = onBalanceRefresh(() => {
    second += 1
  })
  offFirst()
  requestBalanceRefresh()
  assert.equal(first, 0)
  assert.equal(second, 1)
  offSecond()
})
