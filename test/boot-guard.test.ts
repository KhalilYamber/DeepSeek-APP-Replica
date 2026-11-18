import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

/**
 * 把字符串与注释抹成空格（长度不变）：只在真代码上找语法标记。
 * 不做这一步的话，注释里「不要写 const/let、?. 这类」这种说明自己就会命中规则。
 */
const mask = (source: string) => {
  const out = source.split('')
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < source.length) {
    const char = source[i]
    if (char === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    if (char === '"' || char === "'") {
      let j = i + 1
      while (j < source.length && source[j] !== char) {
        if (source[j] === '\\') j++
        j++
      }
      blank(i, Math.min(j, source.length))
      i = Math.min(j + 1, source.length)
      continue
    }
    i++
  }
  return out.join('')
}

const inlineScriptRaw = (name: string) => {
  const match = /<script>([\s\S]*?)<\/script>/.exec(read(name))
  assert.ok(match, `${name} 里应该有一段内联脚本`)
  return match[1]
}

const inlineScript = (name: string) => mask(inlineScriptRaw(name))

// 老内核遇到这些会「解析失败」，症状是整段脚本被丢掉——连错误页都画不出来，
// 所以它们比任何功能都更该被机器拦住。
const ES2015_PLUS: [string, RegExp][] = [
  ['箭头函数', /=>/],
  ['const 声明', /\bconst\b/],
  ['let 声明', /\blet\b/],
  ['模板字符串', /`/],
  ['可选链 ?.', /\?\./],
  ['空值合并 ??', /\?\?/],
  ['class 声明', /\bclass\b/],
]

const assertEs5 = (name: string) => {
  const script = inlineScript(name)
  for (const [label, pattern] of ES2015_PLUS) {
    assert.ok(!pattern.test(script), `${name} 的内联脚本里出现了${label}：老 WebView 解析失败会把整段兜底丢掉`)
  }
}

test('index.html 的内联兜底脚本是纯 ES5', () => {
  assertEs5('index.html')
})

test('check.html 的内联脚本是纯 ES5（它要在比应用更老的机器上打开）', () => {
  assertEs5('check.html')
})

test('index.html 的兜底挂了错误监听，判定点是 8 秒 / 120px', () => {
  const script = inlineScriptRaw('index.html')
  assert.match(script, /addEventListener\('error'/)
  assert.match(script, /addEventListener\('unhandledrejection'/)
  assert.match(script, /TIMEOUT_MS = 8000/)
  assert.match(script, /ROOT_MIN_HEIGHT = 120/)
  assert.match(script, /MIN_CHROMIUM = 84/)
})

test('「1.5 秒就判死」只用于硬地板；承诺门槛交给 8 秒那条判定归因', () => {
  const script = inlineScriptRaw('index.html')
  // 硬地板（语法门槛）与承诺门槛是两件事：低于硬地板的机器永远渲染不出来，可以提前开口；
  // 70–83 是「可能能跑」的一段，慢设备要给它时间，否则就是 0.4.0 那种误报。
  assert.match(script, /HARD_MIN_CHROMIUM = 70/)
  assert.match(script, /chromium < HARD_MIN_CHROMIUM/)
  assert.match(script, /chromium < MIN_CHROMIUM \? 'kernel' : 'timeout'/)
})

test('check.html 分了「跑不了 / 有毛病 / 未使用兜底」三档，且语法检测走 new Function', () => {
  const script = inlineScriptRaw('check.html')
  assert.match(script, /tier: 'fatal'/)
  assert.match(script, /tier: 'soft'/)
  assert.match(script, /tier: 'info'/)
  // 直接把 ?. 写进检测脚本会让检测脚本自己先死掉，所以必须包在 new Function 里
  assert.match(script, /new Function\(code\)/)
})

test('构建配置把 check.html 拷进 dist（漏了就等于白屏时没有自检入口）', () => {
  const config = readFileSync(new URL('../rspack.config.ts', import.meta.url), 'utf8')
  assert.match(config, /'src\/check\.html'/)
  assert.match(config, /to: 'check\.html'/)
})
