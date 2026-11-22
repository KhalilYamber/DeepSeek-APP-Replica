import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupDigits,
  LONG_MESSAGE_CHARS,
  LONG_MESSAGE_PREVIEW_CHARS,
  previewMarkdown,
} from '../src/utils/longMessage.ts'

test('没超长就原样返回，不碰内容', () => {
  const text = '短回复'.repeat(10)
  assert.equal(previewMarkdown(text), text)
})

test('超长时截到上限以内，且在换行处断开', () => {
  const text = `${'段落一\n\n'.repeat(8000)}尾巴`
  assert.ok(text.length > LONG_MESSAGE_CHARS)
  const preview = previewMarkdown(text, 200)
  assert.ok(preview.length <= 200)
  assert.ok(!preview.endsWith('段'))
  assert.ok(text.startsWith(preview))
})

test('截断后代码围栏是奇数个时，补一个收尾围栏', () => {
  const text = '```ts\nconst a = 1\n' + 'x'.repeat(500)
  const preview = previewMarkdown(text, 60)
  assert.equal((preview.match(/```/g) ?? []).length % 2, 0)
  assert.ok(preview.endsWith('```'))
})

test('围栏本来就是偶数个时不画蛇添足', () => {
  const text = '```ts\nok\n```\n' + 'y'.repeat(500)
  const preview = previewMarkdown(text, 60)
  assert.equal((preview.match(/```/g) ?? []).length % 2, 0)
  assert.ok(!preview.endsWith('\n```'))
})

test('一整段没有换行时硬切，不会返回空串', () => {
  const text = 'a'.repeat(1000)
  const preview = previewMarkdown(text, 100)
  assert.equal(preview.length, 100)
  assert.equal(preview, text.slice(0, 100))
})

test('正好切在开围栏那一行时，整行丢掉，不挂空代码块', () => {
  const text = 'aaa\n```ts\n' + 'x'.repeat(100)
  const preview = previewMarkdown(text, 14)
  assert.equal(preview, 'aaa')
})

test('千分位不依赖系统 locale：200000 → 200,000', () => {
  assert.equal(groupDigits(0), '0')
  assert.equal(groupDigits(999), '999')
  assert.equal(groupDigits(1000), '1,000')
  assert.equal(groupDigits(200000), '200,000')
  assert.equal(groupDigits(-5), '0')
})

test('默认上限与折叠阈值是成对的：预览远小于阈值', () => {
  assert.ok(LONG_MESSAGE_PREVIEW_CHARS < LONG_MESSAGE_CHARS / 2)
})
