import assert from 'node:assert/strict'
import { test } from 'node:test'

import { en } from '../src/i18n/en.ts'
import { zh } from '../src/i18n/zh.ts'

const placeholders = (text: string): string[] => (text.match(/\{(\w+)\}/g) ?? []).sort()

/**
 * tsc 已用 `satisfies Record<keyof typeof zh, string>` 钉住 key 集合与类型。
 * 下面几条守的是 tsc 管不到的内容层：占位符被漏掉、翻译成空串、以及
 * 有人把 satisfies 删掉之后 key 又漂移。
 */
test('中英词条的 key 集合一致', () => {
  const missingInEn = Object.keys(zh).filter((key) => !(key in en))
  const missingInZh = Object.keys(en).filter((key) => !(key in zh))
  assert.deepEqual(missingInEn, [], 'en 缺少这些 key')
  assert.deepEqual(missingInZh, [], 'zh 缺少这些 key')
})

test('同一条目的占位符集合一致——翻译时漏掉 {seconds} 之类的占位会少显示数字', () => {
  const mismatched = Object.keys(zh)
    .filter((key) => key in en)
    .filter((key) => {
      const a = placeholders((zh as Record<string, string>)[key])
      const b = placeholders((en as Record<string, string>)[key])
      return a.join(',') !== b.join(',')
    })
  assert.deepEqual(mismatched, [], '这些 key 的中英占位符不一致')
})

test('没有空翻译', () => {
  const empty = [...Object.entries(zh), ...Object.entries(en)]
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([key]) => key)
  assert.deepEqual(empty, [], '这些 key 的译文是空的')
})
