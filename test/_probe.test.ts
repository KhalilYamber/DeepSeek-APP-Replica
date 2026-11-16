/**
 * 框架自检。
 *
 * 本项目不引入 vitest / tsx，靠 Node 自带的类型剥离直跑 `.ts` 源码。
 * 那条链路有一个隐性的环境前提：Node 主版本 >= 22。低于这个版本，
 * 其余测试文件会以「找不到模块」「无法解析 .ts」的样子集体变红，
 * 而真正的原因不在测试里。
 *
 * 这个文件把那个前提单独钉住：环境不满足时，它给出人能读懂的失败原因，
 * 而不是让 30 条业务测试一起报同一个看不懂的错。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatDate } from '../src/utils/format.ts'

const nodeMajor = Number(process.versions.node.split('.')[0])

test('框架自检：Node 主版本 >= 22（类型剥离的下限）', () => {
  assert.ok(
    nodeMajor >= 22,
    `当前 Node ${process.versions.node}。本项目测试依赖类型剥离，需要 Node >= 22；` +
      '请升级 Node 后重跑 pnpm test。'
  )
})

test('框架自检：能直接 import .ts 源码（前提成立）', () => {
  assert.equal(typeof formatDate, 'function')
})
