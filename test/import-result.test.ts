import assert from 'node:assert/strict'
import { test } from 'node:test'

import { importMessage } from '../src/services/chat/history/result.ts'

test('全部新增时按条数提示', () => {
  assert.deepEqual(importMessage({ imported: 5, skipped: 0, failed: 0 }), {
    key: 'historyImported',
    params: { count: 5 },
  })
})

test('单条新增用单数文案', () => {
  assert.deepEqual(importMessage({ imported: 1, skipped: 0, failed: 0 }), {
    key: 'historyImportedOne',
    params: { count: 1 },
  })
})

test('重复的与损坏的合并成一个跳过数，不混进导入数', () => {
  assert.deepEqual(importMessage({ imported: 3, skipped: 2, failed: 1 }), {
    key: 'historyImportedWithSkipped',
    params: { imported: 3, skipped: 3 },
  })
})

test('全是已存在时不显示成已导入 0 个', () => {
  assert.deepEqual(importMessage({ imported: 0, skipped: 4, failed: 0 }), {
    key: 'historyImportedNothingNew',
    params: { skipped: 4 },
  })
})
