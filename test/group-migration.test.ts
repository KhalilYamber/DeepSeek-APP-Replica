import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { Group } from '../src/services/chat/types.ts'

// 产线源码用 './x.js' 指向 .ts，Node 的类型剥离不重写路径，直接 import 会 ERR_MODULE_NOT_FOUND。
// 这里补一层「.js 找不到就试同名 .ts」的解析，好让测试跑真实源码。
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

const { adoptGroupId, needsGroupsMigration, toGroupRecord } = await import(
  '../src/services/chat/migrateGroups.ts'
)

test('三个起点：只有 12 版（有 folders、没标记）才需要搬', () => {
  // 全新安装与 11 版都没有 folders 表，搬不到东西，直接写标记退出
  assert.equal(needsGroupsMigration(false, false), false)
  // 12 版：表在、标记没写，要搬
  assert.equal(needsGroupsMigration(false, true), true)
  // 已经搬过：标记在，表还没清掉也不再进第二遍
  assert.equal(needsGroupsMigration(true, true), false)
  assert.equal(needsGroupsMigration(true, false), false)
})

test('folderId 改写成 groupId：值不变，旧字段删掉', () => {
  const next = adoptGroupId({ id: 's1', title: 'A', folderId: 'g1' })
  assert.deepEqual(next, { id: 's1', title: 'A', groupId: 'g1' })
  assert.ok(!('folderId' in next), '旧字段必须从记录里消失')
})

test('未分类（folderId 为 null）照样搬到 groupId，仍是未分类', () => {
  assert.deepEqual(adoptGroupId({ id: 's1', folderId: null }), { id: 's1', groupId: null })
})

test('11 版数据没有 folderId：原样返回同一个引用，不会凭空长出 groupId', () => {
  const record = { id: 's1', title: 'A' }
  const next = adoptGroupId(record)
  assert.equal(next, record, '没有该字段时应返回原引用，调用方据此跳过写库')
  assert.ok(!('groupId' in next))
})

test('folderId 之外的其他字段原样保留', () => {
  const messages = [{ id: 'm1' }]
  const next = adoptGroupId({ id: 's1', title: 'A', updatedAt: 7, messages, folderId: 'g1' })
  assert.deepEqual(next, { id: 's1', title: 'A', updatedAt: 7, messages, groupId: 'g1' })
  assert.equal(next.messages, messages)
})

test('folders 记录搬进 groups 时只带 id、name、createdAt', () => {
  const legacy = { id: 'g1', name: '工作', createdAt: 1_000, extra: 'ignored' } as Group
  assert.deepEqual(toGroupRecord(legacy), { id: 'g1', name: '工作', createdAt: 1_000 })
})
