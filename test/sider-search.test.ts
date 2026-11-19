import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

// 钉的是需求本身：APK 里也要有搜索入口。
// 2026-11-18 曾按「只给网页版」用 isNativeApp() 整块挡掉，2026-11-19 按需求打开——别再被顺手关回去。
test('侧栏搜索不再被原生壳挡掉，抽屉与常驻侧栏用的是同一份', () => {
  const sider = read('components/sider/Sider.tsx')
  // 只查真实用法（import 与那个开关变量），注释里提到历史原因不算
  assert.ok(!/import[^\n]*isNativeApp/.test(sider), 'Sider.tsx 又 import 了 isNativeApp')
  assert.ok(!/webSearch/.test(sider), 'Sider.tsx 又出现了 webSearch 开关')
  assert.match(sider, /<SearchBox value=\{query\} onChange=\{setQuery\} \/>/)
  // 移动端抽屉渲染的是 <Sider mobile />，同一份组件即同一份行为
  assert.match(sider, /<Sider mobile \/>/)
})
