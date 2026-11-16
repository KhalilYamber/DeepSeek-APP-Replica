import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatDate, monthKey } from '../src/utils/format.ts'

test('formatDate 输出本地时区的 YYYY-MM-DD', () => {
  assert.equal(formatDate(new Date(2026, 10, 16, 8, 0, 0)), '2026-11-16')
})

test('formatDate 对月与日补零', () => {
  assert.equal(formatDate(new Date(2026, 0, 5, 0, 0, 0)), '2026-01-05')
})

test('formatDate 支持自定义分隔符', () => {
  assert.equal(formatDate(new Date(2026, 10, 16, 8), '/'), '2026/11/16')
})

test('formatDate 接受 Date、时间戳与可解析字符串三种输入', () => {
  const at = new Date(2026, 10, 16, 8, 0, 0)
  assert.equal(formatDate(at), '2026-11-16')
  assert.equal(formatDate(at.getTime()), '2026-11-16')
  assert.equal(formatDate('2026-11-16T08:00:00'), '2026-11-16')
})

test('formatDate 无法解析时返回 null，而不是 Invalid Date 字符串', () => {
  assert.equal(formatDate('not-a-date'), null)
  assert.equal(formatDate(new Date('invalid')), null)
})

test('monthKey 输出补零的 YYYY-MM', () => {
  assert.equal(monthKey(new Date(2026, 10, 16)), '2026-11')
  assert.equal(monthKey(new Date(2026, 0, 1)), '2026-01')
})

test('monthKey 无法解析时返回 null', () => {
  assert.equal(monthKey('not-a-date'), null)
})
