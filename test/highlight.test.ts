import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getHighlightLang } from '../src/services/markdown/highlight.ts'

test('新增的 20 门语言都能映射到自己', () => {
  const langs = [
    'julia',
    'zig',
    'elixir',
    'ocaml',
    'fortran',
    'verilog',
    'vhdl',
    'solidity',
    'hcl',
    'nix',
    'lisp',
    'scheme',
    'clojure',
    'erlang',
    'vbnet',
    'groovy',
    'pascal',
    'less',
    'glsl',
    'regex',
  ]
  for (const lang of langs) {
    assert.equal(getHighlightLang(lang), lang, lang)
  }
})

test('新增别名指向正确语言', () => {
  const pairs: [string, string][] = [
    ['jl', 'julia'],
    ['ex', 'elixir'],
    ['exs', 'elixir'],
    ['ml', 'ocaml'],
    ['f90', 'fortran'],
    ['vhd', 'vhdl'],
    ['tf', 'hcl'],
    ['terraform', 'hcl'],
    ['clj', 'clojure'],
    ['erl', 'erlang'],
    ['vb', 'vbnet'],
    ['pas', 'pascal'],
    ['sol', 'solidity'],
    ['regexp', 'regex'],
    ['ps1', 'powershell'],
  ]
  for (const [alias, lang] of pairs) {
    assert.equal(getHighlightLang(alias), lang, alias)
  }
})

test('老语言与别名不受影响', () => {
  assert.equal(getHighlightLang('py'), 'python')
  assert.equal(getHighlightLang('ts'), 'typescript')
  assert.equal(getHighlightLang('c++'), 'cpp')
  assert.equal(getHighlightLang('yml'), 'yaml')
})

test('未知语言返回 null，交给纯文本展示', () => {
  assert.equal(getHighlightLang('unknown-lang'), null)
  assert.equal(getHighlightLang(''), null)
})
