import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeFormula } from '../src/services/markdown/katex.ts'

const MIDDLE_DOT = String.fromCharCode(183)
const DOT_OPERATOR = String.fromCharCode(8901)

test('中点换成点运算符', () => {
  assert.equal(normalizeFormula(`a${MIDDLE_DOT}b`), `a${DOT_OPERATOR}b`)
})

test('多个中点全部换掉', () => {
  const input = `${MIDDLE_DOT}上海${MIDDLE_DOT}新家客厅${MIDDLE_DOT}`
  assert.equal(normalizeFormula(input), `${DOT_OPERATOR}上海${DOT_OPERATOR}新家客厅${DOT_OPERATOR}`)
})

test('文本模式里的中点也换掉', () => {
  const input = `\\texttt{上海${MIDDLE_DOT}新家客厅}`
  assert.equal(normalizeFormula(input), `\\texttt{上海${DOT_OPERATOR}新家客厅}`)
})

test('不含中点的公式原样返回', () => {
  assert.equal(normalizeFormula('\\frac{a}{b}'), '\\frac{a}{b}')
  assert.equal(normalizeFormula(''), '')
})

test('其他字符不动', () => {
  const input = 'A\u2022B\u00B7C'
  assert.equal(normalizeFormula(input), `A\u2022B${DOT_OPERATOR}C`)
})
