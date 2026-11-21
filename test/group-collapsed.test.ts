import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeCollapsedKeys,
  toggleCollapsedKey,
} from '../src/services/groupCollapsed.ts'

test('切换：没记过就加进去，记过就移出来', () => {
  assert.deepEqual(toggleCollapsedKey([], 'a'), ['a'])
  assert.deepEqual(toggleCollapsedKey(['a'], 'a'), [])
  assert.deepEqual(toggleCollapsedKey(['a'], 'b'), ['a', 'b'])
})

test('全部收起：新键并入，已有的不重复', () => {
  assert.deepEqual(mergeCollapsedKeys(['a'], ['a', 'b'], true), ['a', 'b'])
  assert.deepEqual(mergeCollapsedKeys([], ['a', 'b'], true), ['a', 'b'])
})

test('全部展开：只移出目标键，别人的状态不动', () => {
  assert.deepEqual(mergeCollapsedKeys(['a', 'b', 'c'], ['a', 'b'], false), ['c'])
})

test('目标为空时原样返回', () => {
  assert.deepEqual(mergeCollapsedKeys(['a'], [], true), ['a'])
  assert.deepEqual(mergeCollapsedKeys(['a'], [], false), ['a'])
})
