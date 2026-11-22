import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHUNK_BYTES, CHUNK_THRESHOLD, planNativeWrite } from '../src/services/native/chunkPlan.ts'

test('块长必须是 3 的正整数倍，否则 base64 拼接会错位', () => {
  assert.equal(CHUNK_BYTES % 3, 0)
  assert.throws(() => planNativeWrite(10, 1000), /multiple of 3/)
  assert.throws(() => planNativeWrite(10, 0), /multiple of 3/)
})

test('阈值及以下一次写完，保持老路径', () => {
  assert.deepEqual(planNativeWrite(CHUNK_THRESHOLD), { kind: 'single' })
  assert.deepEqual(planNativeWrite(0), { kind: 'single' })
})

test('超过阈值才分块，且第一块以外的块长都是 3 的倍数', () => {
  const plan = planNativeWrite(CHUNK_THRESHOLD + 1)
  assert.equal(plan.kind, 'chunks')
  if (plan.kind !== 'chunks') {
    return
  }
  assert.ok(plan.ranges.length > 1)
  for (const range of plan.ranges.slice(0, -1)) {
    assert.equal((range.end - range.start) % 3, 0)
    assert.equal(range.end - range.start, CHUNK_BYTES)
  }
})

test('分块首尾相接、不重叠、完整覆盖整个文件', () => {
  const size = CHUNK_THRESHOLD + 12345
  const plan = planNativeWrite(size)
  if (plan.kind !== 'chunks') {
    assert.fail('should chunk')
    return
  }
  assert.equal(plan.ranges[0].start, 0)
  assert.equal(plan.ranges.at(-1)?.end, size)
  for (let i = 1; i < plan.ranges.length; i++) {
    assert.equal(plan.ranges[i].start, plan.ranges[i - 1].end)
  }
  for (const range of plan.ranges) {
    assert.ok(range.end > range.start)
    assert.ok(range.end - range.start <= CHUNK_BYTES)
  }
})
