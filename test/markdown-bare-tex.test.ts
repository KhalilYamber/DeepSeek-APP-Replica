import assert from 'node:assert/strict'
import { test } from 'node:test'

import { matchBareTexParagraph } from '../src/services/markdown/bareTex.ts'

const BACKSLASH = String.fromCharCode(92)
/** 用 @ 写反斜杠，免得满屏转义 */
const tex = (value: string) => value.split('@').join(BACKSLASH)

test('用户反馈的那条整段识别出来', () => {
  const value = tex('@small@textcolor{#b2b2b2}{@texttt{上海·新家客厅 @;@,2016.1.2@,@;17:03}}')
  assert.equal(matchBareTexParagraph(value), value)
})

test('前后空白不影响', () => {
  const value = tex('@frac{a}{b}')
  assert.equal(matchBareTexParagraph(`  ${value}  `), value)
})

test('普通中文句子里的 LaTeX 不识别（讲解用法的场景）', () => {
  assert.equal(matchBareTexParagraph(tex('你可以用 @textcolor{red}{文字} 来上色')), null)
  assert.equal(matchBareTexParagraph(tex('公式写成 @frac{a}{b} 这样就行')), null)
})

test('前缀文字混排不识别', () => {
  assert.equal(matchBareTexParagraph(tex('标签：@small@textcolor{#b2b2b2}{@texttt{上海}}')), null)
})

test('Windows 路径、换行转义、正则都不识别', () => {
  assert.equal(matchBareTexParagraph(tex('C:@Users@yang@Documents')), null)
  assert.equal(matchBareTexParagraph(tex('用 @n 换行')), null)
  assert.equal(matchBareTexParagraph(tex('@d{3}-@d{4}')), null)
})

test('单独的 @small 没有参数，不识别', () => {
  assert.equal(matchBareTexParagraph(tex('@small')), null)
})

test('未闭合不识别（流式中间态不闪）', () => {
  assert.equal(matchBareTexParagraph(tex('@texttt{上海 新家')), null)
})

test('括号不配平不识别', () => {
  assert.equal(matchBareTexParagraph(tex('@frac{a}{b}}')), null)
})

test('多行不识别', () => {
  assert.equal(matchBareTexParagraph(tex('@frac{a}{b}\n@frac{c}{d}')), null)
})

test('普通文本不识别', () => {
  assert.equal(matchBareTexParagraph('今天天气不错。'), null)
  assert.equal(matchBareTexParagraph(''), null)
})
