import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

// 这几条是「结构不变量」：边界一旦被谁顺手删掉，整屏空白就又回来了。
// 渲染行为本身不写测试（项目约定：UI 靠构建 + 截图 + 真机点），这里只钉住「还在」。
test('最外层挂了错误边界：整树崩掉时不会全白', () => {
  const main = read('main.tsx')
  assert.match(main, /<ErrorBoundary scope="root">\s*<App \/>/)
})

test('会话区与单条消息各自有边界：一条消息坏掉不拖累整屏', () => {
  assert.match(read('app/App.tsx'), /<ErrorBoundary scope="content">/)
  assert.match(
    read('components/messages/MessageList.tsx'),
    /<ErrorBoundary key=\{message\.id\} scope="message" compact>/
  )
})

test('边界把错误记进本机诊断，并且能重试', () => {
  const source = read('components/base/ErrorBoundary.tsx')
  assert.match(source, /static getDerivedStateFromError/)
  assert.match(source, /componentDidCatch/)
  assert.match(source, /logDiagnostic\('render'/)
})
