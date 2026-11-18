import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createRegionFormatter } from '../src/services/regionName.ts'

const host = Intl as unknown as Record<string, unknown>

/** 临时把 Intl.DisplayNames 换成别的东西，跑完还原——模拟旧内核上的宿主环境 */
const withDisplayNames = (value: unknown, run: () => void) => {
  const saved = host.DisplayNames
  host.DisplayNames = value
  try {
    run()
  } finally {
    host.DisplayNames = saved
  }
}

test('宿主没有 Intl.DisplayNames（Chrome 70–80）时返回 null，不抛', () => {
  withDisplayNames(undefined, () => {
    assert.equal(createRegionFormatter('zh-CN'), null)
    assert.equal(createRegionFormatter('en-US'), null)
  })
})

test('构造器抛错（ICU 数据不全）时返回 null，不抛', () => {
  const throwing = function ThrowingDisplayNames() {
    throw new TypeError('Intl.DisplayNames is not a constructor')
  }
  withDisplayNames(throwing, () => {
    assert.equal(createRegionFormatter('zh-CN'), null)
  })
})

test('正常环境下返回可用的格式化器', () => {
  const formatter = createRegionFormatter('zh-CN')
  assert.ok(formatter, '本机应该支持 Intl.DisplayNames')
  assert.equal(typeof formatter?.of('JP'), 'string')
})

// 这条是回归闸：把 new 搬回模块顶层，就等于在旧内核上把整包打死，
// 而单测在本机永远复现不出来——只能靠源码断言拦住。
test('location.ts 不在模块顶层构造 Intl.DisplayNames', () => {
  const source = readFileSync(new URL('../src/services/location.ts', import.meta.url), 'utf8')
  assert.ok(!/new\s+Intl\.DisplayNames/.test(source), 'location.ts 里重新出现了顶层 new Intl.DisplayNames')
})
