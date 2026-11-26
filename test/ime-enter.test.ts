import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCompositionTracker, isImeSettling } from '../src/utils/imeEnter.ts'

test('没在组字时，普通回车不算输入法按键', () => {
  assert.equal(isImeSettling({ isComposing: false, keyCode: 13, composingRecently: false }), false)
})

test('浏览器报组字中，回车算输入法按键', () => {
  assert.equal(isImeSettling({ isComposing: true, keyCode: 13, composingRecently: false }), true)
})

test('安卓输入法报 keyCode 229，即便浏览器说没在组字也算', () => {
  assert.equal(isImeSettling({ isComposing: false, keyCode: 229, composingRecently: false }), true)
})

test('组字刚结束的那一轮也算，覆盖 WebKit 先发 compositionend 的时序', () => {
  assert.equal(isImeSettling({ isComposing: false, keyCode: 13, composingRecently: true }), true)
})

test('组字结束后，标记只在同一轮内有效', () => {
  const pending: Array<() => void> = []
  const tracker = createCompositionTracker((task) => pending.push(task))

  tracker.start()
  assert.equal(tracker.isSettling(), true)

  tracker.end()
  assert.equal(tracker.isSettling(), true)

  const flush = pending.shift()
  assert.ok(flush)
  flush()
  assert.equal(tracker.isSettling(), false)
})

test('组字中再按回车仍然是输入法按键，不会被上一轮的结束标记放过', () => {
  const tracker = createCompositionTracker(() => {})
  tracker.start()
  tracker.end()
  tracker.start()
  assert.equal(tracker.isSettling(), true)
})
