import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { Group, SessionSummary } from '../src/services/chat/types.ts'

// 产线源码用 './x.js' 指向 .ts，Node 的类型剥离不重写路径，直接 import 会 ERR_MODULE_NOT_FOUND。
// 这里补一层「.js 找不到就试同名 .ts」的解析，好让测试跑真实源码，而不是把待测逻辑抄一份进测试。
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (!specifier.endsWith('.js') || !context.parentURL) throw error
      const target = new URL(specifier, context.parentURL)
      const candidate = new URL(`${target.href.slice(0, -3)}.ts`)
      if (!existsSync(fileURLToPath(candidate))) throw error
      return { url: candidate.href, shortCircuit: true }
    }
  },
})

const { groupSessionsByDate, groupSessionsByGroup } = await import(
  '../src/services/chat/sessionGroups.ts'
)

const t = (key: string) => key

/** 本地时间构造时间戳：startOfDay 按本地时区算，用 UTC 构造会跨日 */
const at = (month: number, day: number, hour = 9): number => new Date(2026, month - 1, day, hour).getTime()

/** groupId 缺省（老数据没有这个字段）时返回不含该键的对象 */
const session = (id: string, updatedAt: number, groupId?: string | null): SessionSummary =>
  groupId === undefined
    ? { id, title: id, createdAt: updatedAt, updatedAt }
    : { id, title: id, createdAt: updatedAt, updatedAt, groupId }

const group = (id: string, name: string, createdAt: number): Group => ({ id, name, createdAt })

const ids = (list: { sessions: SessionSummary[] }[]) =>
  list.flatMap((group) => group.sessions.map((item) => item.id))

const byKey = (result: ReturnType<typeof groupSessionsByGroup>, key: string) =>
  result.find((group) => group.key === key)

const NOW = at(11, 20, 12)

test('分组按 createdAt 升序，未分类固定排最后', () => {
  const groups = [group('b', 'Work', 2_000), group('a', 'Notes', 1_000), group('c', 'Archive', 3_000)]
  const result = groupSessionsByGroup([], groups, NOW, t)
  assert.deepEqual(
    result.map((group) => group.key),
    ['a', 'b', 'c', '__uncategorized__'],
  )
  assert.deepEqual(
    result.map((group) => group.label),
    ['Notes', 'Work', 'Archive', 'groupUncategorized'],
  )
  assert.deepEqual(
    result.map((group) => group.groupId),
    ['a', 'b', 'c', null],
  )
})

test('分组内部沿用 groupSessionsByDate 的时间分组', () => {
  const sessions = [
    session('today', at(11, 20, 10), 'a'),
    session('yesterday', at(11, 19, 18), 'a'),
    session('week', at(11, 17, 9), 'a'),
    session('month', at(11, 1, 9), 'a'),
    session('older', at(9, 15, 9), 'a'),
  ]
  const notes = byKey(groupSessionsByGroup(sessions, [group('a', 'Notes', 1_000)], NOW, t), 'a')
  assert.deepEqual(
    notes?.groups.map((group) => group.key),
    [
      'sessionHistoryTimelineLabelToday',
      'sessionHistoryTimelineLabelYesterday',
      'sessionHistoryTimelineLabel7days',
      'sessionHistoryTimelineLabel30days',
      '2026-09',
    ],
  )
  assert.deepEqual(
    ids(notes?.groups ?? []),
    ['today', 'yesterday', 'week', 'month', 'older'],
  )
  // t 透传给了内部的时间分组：label 与 key 一致（t 是恒等函数）
  assert.deepEqual(
    notes?.groups.map((group) => group.label),
    notes?.groups.map((group) => group.key),
  )
})

test('空分组也返回，groups 为空数组', () => {
  const groups = [group('a', 'Notes', 1_000), group('b', 'Work', 2_000), group('c', 'Archive', 3_000)]
  const result = groupSessionsByGroup([session('one', at(11, 20), 'b')], groups, NOW, t)
  assert.equal(result.length, 4)
  assert.deepEqual(byKey(result, 'a')?.groups, [])
  assert.deepEqual(byKey(result, 'c')?.groups, [])
  assert.deepEqual(ids(byKey(result, 'b')?.groups ?? []), ['one'])
})

test('groupId 指向不存在的分组时归到未分类', () => {
  const sessions = [
    session('kept', at(11, 20, 10), 'a'),
    session('ghost', at(11, 20, 8), 'deleted-group'),
    session('none', at(11, 19, 20), null),
    session('legacy', at(11, 19, 18)),
  ]
  const result = groupSessionsByGroup(sessions, [group('a', 'Notes', 1_000)], NOW, t)
  assert.deepEqual(ids(byKey(result, 'a')?.groups ?? []), ['kept'])
  const rest = byKey(result, '__uncategorized__')
  assert.deepEqual(ids(rest?.groups ?? []), ['ghost', 'none', 'legacy'])
  // 归进来的会话同样按时间分组，而不是并成一堆
  assert.deepEqual(
    rest?.groups.map((group) => group.key),
    ['sessionHistoryTimelineLabelToday', 'sessionHistoryTimelineLabelYesterday'],
  )
})

test('没有会话时未分类组仍在', () => {
  const empty = groupSessionsByGroup([], [], NOW, t)
  assert.deepEqual(empty, [
    { key: '__uncategorized__', label: 'groupUncategorized', groupId: null, groups: [] },
  ])
})

test('分组内的时间分组与直接调用 groupSessionsByDate 逐组一致', () => {
  const groups = [group('a', 'Notes', 1_000), group('b', 'Work', 2_000)]
  const sessions = [
    session('a1', at(11, 20, 10), 'a'),
    session('b1', at(11, 20, 9), 'b'),
    session('a2', at(11, 20, 8), 'a'),
    session('b2', at(11, 19, 19), 'b'),
    session('a3', at(11, 17, 9), 'a'),
    session('b3', at(11, 1, 9), 'b'),
    session('a4', at(10, 5, 9), 'a'),
    session('b4', at(9, 15, 9), 'b'),
  ]
  const result = groupSessionsByGroup(sessions, groups, NOW, t)
  const known = new Set(groups.map((item) => item.id))
  const bucketOf = (item: SessionSummary) => (item.groupId && known.has(item.groupId) ? item.groupId : null)
  for (const group of result) {
    const own = sessions.filter((item) => bucketOf(item) === group.groupId)
    assert.deepEqual(group.groups, groupSessionsByDate(own, NOW, t))
  }
  // 时间分组本身没被改动：时间边界与按月 key 照旧
  assert.deepEqual(
    groupSessionsByDate(sessions, NOW, t).map((group) => group.key),
    [
      'sessionHistoryTimelineLabelToday',
      'sessionHistoryTimelineLabelYesterday',
      'sessionHistoryTimelineLabel7days',
      'sessionHistoryTimelineLabel30days',
      '2026-10',
      '2026-09',
    ],
  )
})

test('分组内的会话保持传入顺序', () => {
  const sessions = [
    session('new', at(11, 20, 10), 'a'),
    session('mid', at(11, 19, 10), 'a'),
    session('old', at(11, 18, 10), 'a'),
  ]
  const notes = byKey(groupSessionsByGroup(sessions, [group('a', 'Notes', 1_000)], NOW, t), 'a')
  assert.deepEqual(ids(notes?.groups ?? []), ['new', 'mid', 'old'])
})
