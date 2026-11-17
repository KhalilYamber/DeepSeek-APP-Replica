#!/usr/bin/env node
/**
 * 构建后兼容扫描：找出「有内核门槛、但没兜底」的写法，让门禁拦住，而不是等老设备白屏。
 *
 * 目标内核：Chromium 93（Android 12 及更早设备的出厂 WebView 量级）。
 *
 * 查四类：
 *   1. 视口单位 dvh/svh/lvh/dvw/svw/lvw 没有更早的 vh/vw 兜底
 *   2. CSS 有版本门槛的选择器与函数（:has() / @container / color-mix() / aspect-ratio）
 *   3. JS 新 API 的运行时调用（toSorted / toReversed / toSpliced / .with() /
 *      Object.groupBy / Array.fromAsync / Promise.withResolvers / structuredClone）
 *   4. 源码里解 navigator.userAgent 版本号做能力判断（能力检测应该用特性探测）
 *
 * 第 1-3 类扫 dist/ 的 CSS 与 JS 产物，第 4 类扫 src/。
 *
 * 退出码：0 = 干净（只剩提示级）；1 = 有 error 级问题；2 = 脚本自身出错（如 dist 不存在）。
 *
 * 已知边界：JS 的正则字面量判断是启发式的。判断错的地方只可能让「字符串里的假阳性」被漏掉，
 * 不会把真实的调用形态吞掉——除非那行本身是畸形代码。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, sep, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const TARGET_KERNEL = 'Chromium 93'

/**
 * 豁免表：一条一个对象，形状固定为
 *   { rule, files: [...], reason, fallback }
 *
 * - rule 可以带子规则：'js-new-api:structuredClone' 只放行这一个 API，
 *   不带冒号的 'js-new-api' 才是整个规则（别偷懒用后者）。
 * - files 是相对仓库根的 glob 数组：* 跨一段路径、** 跨多段。
 *   带 contenthash 的产物写成 'dist/static/js/async/3909.*.js'，
 *   不要放宽到 'dist/static/js/async/*.js'——那样 mermaid 升级带来的新 API 会一起被放过。
 * - reason 一句话，fallback 写兜底在哪（哪个文件、哪一行、谁维护）。
 *   加豁免必须在提交信息里抄这两句，否则下一轮没人知道它凭什么在这儿。
 *
 * 判断标准是「有兜底」，不是「不修了」。区别：
 *   有兜底 = 老内核上走降级路径，功能还在，只是弱一点；
 *   不修了 = 老内核上照样崩，只是我们不想看它。
 * 后者不许写进这张表。
 */
const EXEMPTIONS = [
  // 例子（默认空的：能修的就去修，别拿豁免当遮布）：
  // {
  //   rule: 'js-new-api:structuredClone',
  //   files: ['dist/static/js/async/3909.*.js'],
  //   reason: 'mermaid 只在渲染图表时调用',
  //   fallback: 'src/app/polyfills.ts 的 JSON 深拷贝兜底（主 chunk 先执行）',
  // },
]

/**
 * 兜底检测：产物里出现这些痕迹，说明这个成员在老内核上不一定会缺。
 * 只看得到「产物里有兜底代码」，看不到「它在调用点之前执行」——所以额外要求痕迹出现在
 * main.<hash>.js（入口，先于异步 chunk 执行）里，才把该类调用降级成 info。
 * 找不到痕迹就照旧报 error：宁可让人去看一眼，也不要默认「应该有吧」。
 */
const FALLBACK_PROBES = {
  structuredClone: [
    /(?:globalThis|window|self)\s*\.\s*structuredClone\s*=(?!=)/,
    /typeof\s+(?:globalThis\s*\.\s*|window\s*\.\s*|self\s*\.\s*)?structuredClone/,
  ],
  'Array.prototype.toSorted': [/Array\s*\.\s*prototype\s*\.\s*toSorted\s*=(?!=)/],
  'Array.prototype.toReversed': [/Array\s*\.\s*prototype\s*\.\s*toReversed\s*=(?!=)/],
  'Array.prototype.toSpliced': [/Array\s*\.\s*prototype\s*\.\s*toSpliced\s*=(?!=)/],
  'Array.prototype.with': [/Array\s*\.\s*prototype\s*\.\s*with\s*=(?!=)/],
  'Object.groupBy': [/Object\s*\.\s*groupBy\s*=(?!=)/],
  'Array.fromAsync': [/Array\s*\.\s*fromAsync\s*=(?!=)/],
  'Promise.withResolvers': [/Promise\s*\.\s*withResolvers\s*=(?!=)/],
}

const RULES = {
  'viewport-unit-fallback': {
    severity: 'error',
    label: '视口单位缺 vh/vw 兜底',
    why: 'dvh/svh/lvh 需 Chrome 108+。Chromium 93 不认识这个单位，整条声明作废（不是降级成 vh），height 作废会让根容器塌成 0——2026-11 那一版白屏就是这么来的。',
    fix: '同一个声明块里先写一行等价的 vh（横向用 vw），再写 dvh 那一行；旧内核吃前一行，新内核吃后一行。',
  },
  'css-has-selector': {
    severity: 'error',
    label: ':has() 选择器',
    why: ':has() 需 Chrome 105+。Chromium 93 会把用到它的整条规则静默丢弃，同一组选择器里的兄弟规则一起失效（本项目明确不用）。',
    fix: '改成相邻兄弟选择器（h4 + ul）、由 JS 打标记类，或把这条样式降级成不影响主布局的装饰项。',
  },
  'css-container-query': {
    severity: 'error',
    label: '@container 容器查询',
    why: '@container 需 Chrome 105+（样式查询 111+）。旧内核整块丢弃，块内样式全部不生效（本项目明确不用）。',
    fix: '换成组件外层的普通媒体查询，或由 JS 量出宽度后加到根元素的标记类上。',
  },
  'css-color-mix': {
    severity: 'error',
    label: 'color-mix()',
    why: 'color-mix() 需 Chrome 111+。旧内核整条声明作废，颜色退回继承值，常见表现是文字与背景同色。',
    fix: '预先算好混合结果写成一个静态色值兜底，或直接用 rgba/hex。',
  },
  'css-aspect-ratio': {
    severity: 'hint',
    label: 'aspect-ratio',
    why: 'aspect-ratio 需 Chrome 88+，目标内核 93 支持，因此只做提示：更老的出厂内核（Android 8/9 一类）上会退化成 auto。',
    fix: '若这个比例决定布局（决定高度），改成 padding-top 百分比容器；纯装饰可以忽略。',
  },
  'js-new-api': {
    severity: 'error',
    label: 'JS 新 API 运行时调用',
    why: '目标内核没有这个成员时是 TypeError，整个调用栈断掉，不是静默降级。',
    fix: '调用前用特性探测（typeof structuredClone === "function"）分支，或换成等价的老写法；多数 API 是数组方法改写成 slice+sort/map。',
  },
  'ua-version-sniff': {
    severity: 'error',
    label: '解 UA 版本号判断能力',
    why: 'UA 版本号与真实能力不一一对应（同一内核被各家套壳报不同版本），按版本号猜能力会在某台机器上判错，而且错的是「以为支持」。',
    fix: '改成特性探测：typeof structuredClone === "function"、CSS.supports("height", "100dvh")、matchMedia(...)，这些问的是能力本身。',
  },
}

const JS_APIS = [
  { api: 'Array.prototype.toSorted', min: 110, re: /\.\s*toSorted\s*\(/g },
  { api: 'Array.prototype.toReversed', min: 110, re: /\.\s*toReversed\s*\(/g },
  { api: 'Array.prototype.toSpliced', min: 110, re: /\.\s*toSpliced\s*\(/g },
  // 参数以 { 开头的一律不算。判据：Array.prototype.with 的第一个参数是下标（数字），
  // 而 URI#with({path}) 这类对象方法第一个参数是对象字面量。产物里 8794.*.js 的 4 处
  // 全是 vscode-uri 的 URI#with，用这条判据排除掉，不靠豁免表。
  { api: 'Array.prototype.with', min: 110, re: /\.\s*with\s*\(\s*(?!\{)/g },
  { api: 'Object.groupBy', min: 117, re: /(?<![\w$])Object\s*\.\s*groupBy\s*\(/g },
  { api: 'Array.fromAsync', min: 121, re: /(?<![\w$])Array\s*\.\s*fromAsync\s*\(/g },
  { api: 'Promise.withResolvers', min: 119, re: /(?<![\w$])Promise\s*\.\s*withResolvers\s*\(/g },
  { api: 'structuredClone', min: 98, re: /(?<![\w$.])structuredClone\s*\(/g },
]

const CSS_SCAN_RULES = [
  { rule: 'css-has-selector', re: /:has\s*\(/g },
  { rule: 'css-container-query', re: /@container(?![-\w])/g },
  { rule: 'css-color-mix', re: /color-mix\s*\(/g },
  { rule: 'css-aspect-ratio', re: /(?<=[;{}\s])aspect-ratio\s*:/g },
]

const VIEWPORT_UNIT = /(?<![\w.-])\d*\.?\d+(dvh|svh|lvh|dvw|svw|lvw)(?![\w-])/gi

const HELP = `scan-compat —— 构建后扫「有内核门槛但没兜底」的写法（目标内核 ${TARGET_KERNEL}）

用法
  node tools/scan-compat.mjs [选项]

选项
  --dist <dir>   要扫的产物目录，默认 <仓库>/dist
  --src <dir>    源码目录，默认 <仓库>/src（只有 UA 版本判断这一条扫它）
  --json         只输出机器可读 JSON（stdout），人类可读的部分不上屏
  --help, -h     这份说明

它查什么
  1 视口单位      dvh/svh/lvh/dvw/svw/lvw 出现在 CSS 里时，同一个声明块内必须有
                  等价的 vh/vw 声明在它之前。没有就报 error。
  2 CSS 新特性    :has() / @container / color-mix() → error
                  aspect-ratio → hint（目标内核支持，只防更老的出厂内核）
  3 JS 新 API     toSorted / toReversed / toSpliced / Array.prototype.with /
                  Object.groupBy / Array.fromAsync / Promise.withResolvers /
                  structuredClone 的运行时调用 → error
                  字符串与注释里出现不算（会先做掩码再匹配）
                  产物入口 chunk（main.*.js）里找得到兜底代码时降级为 info：
                  那说明老内核上不一定缺这个成员。只降级、不消失，看得见才敢信。
  4 版本号猜能力  src/ 里用 navigator.userAgent（或 appVersion）解版本号做能力判断 → error
                  依赖包里也有 UA 判断（如 process.platform 的 Windows 探测），但它们不是
                  在做版本号猜能力，而且第 4 条只扫 src/，产物里的 UA 不参与判定。

两条按语义排除、不用写进豁免表的：
  · '.with(' 后面跟 { 的（URI#with({path}) 这类对象方法）：Array.prototype.with 的首参是下标
  · 依赖包里的 navigator.userAgent（见上）

退出码
  0  干净（允许只剩 hint / info）
  1  有 error 级问题
  2  脚本自身出错（dist 不存在、产物不完整、参数不认识等）

豁免怎么写
  改本文件顶部的 EXEMPTIONS 数组，一条一个对象：
      {
        rule: 'js-new-api:structuredClone',        // 子规则只放行这一个 API
        files: ['dist/static/js/async/3909.*.js'], // 相对仓库根的 glob，* 跨一段、** 跨多段
        reason: '为什么可以不管',
        fallback: '兜底在哪（哪个文件、哪一行、谁维护）',
      }
  - 别用不带冒号的 'js-new-api' 图省事——那会把一整类 API 全放过；
  - 别把 files 放宽到 'dist/static/js/async/*.js'——依赖升级带来的新 API 会跟着漏；
  - 带 contenthash 的文件名用 '3909.*.js' 吃掉 hash，而不是把整条路径写死；
  - 加豁免必须在提交信息里抄 reason 与 fallback 两句。
  判断标准是「有兜底」，不是「不修了」：前者是旧内核上走降级路径、功能还在，
  后者是旧内核上照样崩、只是不想看。后者不许写进这张表。
`

const relPath = (abs) => {
  const r = relative(REPO_ROOT, abs)
  if (r && !r.startsWith('..') && !r.includes(':')) {
    return r.split(sep).join('/')
  }
  return abs.split(sep).join('/')
}

const walk = (dir, exts) => {
  const out = []
  const visit = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) {
        visit(p)
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(p)
      }
    }
  }
  visit(dir)
  return out.sort()
}

const globToRegExp = (glob) => {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const body = escaped.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')
  return new RegExp(`^${body}$`)
}

const lineIndex = (text) => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      starts.push(i + 1)
    }
  }
  return starts
}

const locate = (starts, offset) => {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 }
}

const excerpt = (text, offset, width = 72) => {
  const from = Math.max(0, offset - Math.floor(width / 3))
  const slice = text.slice(from, from + width).replace(/[\r\n\t]+/g, ' ')
  return slice.trim()
}

/** 注释与字符串内内容换成空格，长度不变，偏移仍对得上原文 */
const maskCss = (text) => {
  const out = text.split('')
  let i = 0
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      for (let k = i; k < stop; k++) {
        if (out[k] !== '\n') out[k] = ' '
      }
      i = stop
      continue
    }
    const quote = text[i]
    if (quote === '"' || quote === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') j++
        j++
      }
      for (let k = i + 1; k < Math.min(j, text.length); k++) {
        if (out[k] !== '\n') out[k] = ' '
      }
      i = Math.min(j + 1, text.length)
      continue
    }
    i++
  }
  return out.join('')
}

const REGEX_AFTER_KEYWORD = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'delete',
  'void',
  'do',
  'else',
  'yield',
  'await',
  'instanceof',
  'new',
])
const REGEX_AFTER_CHAR = new Set('([{,;:=!&|?+-*%^~<>'.split(''))

/** 注释、字符串、正则字面量换成空格，长度不变；偏移与行号仍对得上原文 */
const maskJs = (text) => {
  const out = text.split('')
  const blank = (from, to) => {
    for (let k = from; k < to; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }
  let i = 0
  let lastToken = ''
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') j++
        j++
      }
      blank(i + 1, Math.min(j, text.length))
      i = Math.min(j + 1, text.length)
      lastToken = 'literal'
      continue
    }
    if (c === '/' && (lastToken === '' || REGEX_AFTER_CHAR.has(lastToken) || REGEX_AFTER_KEYWORD.has(lastToken))) {
      let j = i + 1
      let inClass = false
      while (j < text.length) {
        const d = text[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === '\n') break
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) break
        j++
      }
      blank(i + 1, Math.min(j, text.length))
      i = Math.min(j + 1, text.length)
      lastToken = 'literal'
      continue
    }
    if (/[\w$]/.test(c)) {
      let j = i
      while (j < text.length && /[\w$]/.test(text[j])) j++
      lastToken = text.slice(i, j)
      i = j
      continue
    }
    if (!/\s/.test(c)) {
      lastToken = c
    }
    i++
  }
  return out.join('')
}

const blocksOf = (masked) => {
  const blocks = []
  const stack = []
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '{') {
      const block = { start: i, end: masked.length }
      stack.push(block)
      blocks.push(block)
    } else if (masked[i] === '}' && stack.length > 0) {
      stack.pop().end = i
    }
  }
  return blocks
}

const innermostBlock = (blocks, offset) => {
  let found = null
  for (const block of blocks) {
    if (block.start < offset && offset < block.end) {
      if (!found || block.start > found.start) found = block
    }
  }
  return found
}

const FALLBACK_UNIT = { dvh: 'vh', svh: 'vh', lvh: 'vh', dvw: 'vw', svw: 'vw', lvw: 'vw' }

const scanCss = (file, text, push) => {
  const masked = maskCss(text)
  const starts = lineIndex(text)
  const blocks = blocksOf(masked)
  const seen = new Set()
  const report = (rule, offset, extra) => {
    const key = `${rule}@${offset}`
    if (seen.has(key)) return
    seen.add(key)
    const { line, column } = locate(starts, offset)
    push({
      rule,
      severity: RULES[rule].severity,
      file,
      offset,
      line,
      column,
      excerpt: excerpt(text, offset),
      ...extra,
    })
  }

  for (const match of masked.matchAll(VIEWPORT_UNIT)) {
    const offset = match.index
    // CSS 单位不区分大小写：100DVH 在旧内核上同样整条作废
    const unit = match[1].toLowerCase()
    const block = innermostBlock(blocks, offset)
    if (!block) {
      report('viewport-unit-fallback', offset, { detail: `${match[0]} 不在任何声明块里，无从判断兜底` })
      continue
    }
    const declStart = Math.max(masked.lastIndexOf(';', offset - 1), masked.lastIndexOf('{', offset - 1)) + 1
    const declHead = masked.slice(declStart, offset)
    const propMatch = declHead.match(/^\s*(--?[A-Za-z][\w-]*|[A-Za-z][\w-]*)\s*:/)
    if (!propMatch) {
      report('viewport-unit-fallback', offset, { detail: `${match[0]} 找不到所属属性名` })
      continue
    }
    const prop = propMatch[1]
    const fallback = FALLBACK_UNIT[unit]
    const region = masked.slice(block.start, declStart)
    const declRe = /(?:^|[;{])\s*(--?[A-Za-z][\w-]*|[A-Za-z][\w-]*)\s*:\s*([^;{}]*)/g
    let hasFallback = false
    for (const decl of region.matchAll(declRe)) {
      if (decl[1] === prop && new RegExp(`\\d(?:\\.\\d+)?${fallback}(?![\\w-])`, 'i').test(decl[2])) {
        hasFallback = true
        break
      }
    }
    if (!hasFallback) {
      report('viewport-unit-fallback', offset, {
        detail: `${prop} 用了 ${unit}，但同一块里前面没有 ${fallback} 版本`,
      })
    }
  }

  for (const { rule, re } of CSS_SCAN_RULES) {
    for (const match of masked.matchAll(re)) {
      report(rule, match.index, {})
    }
  }
}

const scanJs = (file, text, push) => {
  const masked = maskJs(text)
  const starts = lineIndex(text)
  for (const { api, min, re } of JS_APIS) {
    for (const match of masked.matchAll(re)) {
      const offset = match.index
      const { line, column } = locate(starts, offset)
      push({
        rule: 'js-new-api',
        severity: RULES['js-new-api'].severity,
        file,
        offset,
        line,
        column,
        excerpt: excerpt(text, offset),
        detail: `${api}（需 Chrome ${min}+）被直接调用`,
        api,
      })
    }
  }
}

// 只扫 src/。依赖包里也有 navigator.userAgent（产物里 8794.*.js 那处是 process.platform
// 的 Windows 探测，判的是运行平台而不是内核版本），那类不算「靠版本号猜能力」，
// 而且第 4 条本来就只对项目自己的源码负责，所以产物里的 UA 不参与判定。
const UA_RE = /\bnavigator\s*\.\s*(userAgent|appVersion)\b/g
const VERSION_SIGNAL = /(Chrome|CriOS|Chromium|Version|Firefox|Edg|OPR|SamsungBrowser)\s*\\?\/\s*\\?\(?\??\d|parseInt\s*\(|parseFloat\s*\(|Number\s*\(|[<>]=?\s*\d{2,}/

const scanSrc = (file, text, push) => {
  const masked = maskJs(text)
  const starts = lineIndex(text)
  for (const match of masked.matchAll(UA_RE)) {
    const offset = match.index
    const context = masked.slice(Math.max(0, offset - 220), offset + 220).replace(/\s+/g, '')
    const { line, column } = locate(starts, offset)
    const looksLikeSniff = VERSION_SIGNAL.test(context)
    push({
      rule: 'ua-version-sniff',
      severity: looksLikeSniff ? RULES['ua-version-sniff'].severity : 'hint',
      file,
      offset,
      line,
      column,
      excerpt: excerpt(text, offset),
      detail: looksLikeSniff
        ? '附近出现版本号解析或数值比较，像是在按版本号猜能力'
        : '扫到 navigator.userAgent，附近没看出数值比较；若不是做能力判断可以不管',
    })
  }
}

const ruleKey = (finding) => (finding.api ? `${finding.rule}:${finding.api}` : finding.rule)

const ruleMatches = (exemption, finding) =>
  exemption.rule.includes(':') ? exemption.rule === ruleKey(finding) : exemption.rule === finding.rule

const exemptGlobs = (exemption) =>
  Array.isArray(exemption.files) ? exemption.files : exemption.file ? [exemption.file] : []

const exempted = (finding) =>
  EXEMPTIONS.find(
    (exemption) =>
      ruleMatches(exemption, finding) && exemptGlobs(exemption).some((glob) => globToRegExp(glob).test(finding.file))
  )

const main = () => {
  const args = { json: false, help: false }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--dist' || arg === '--src') {
      const value = argv[++i]
      if (!value) fail2(`${arg} 需要一个目录参数`)
      args[arg.slice(2)] = value
    } else {
      fail2(`不认识的参数：${arg}（看 node tools/scan-compat.mjs --help）`)
    }
  }
  if (args.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  const distDir = resolve(REPO_ROOT, args.dist ?? 'dist')
  const srcDir = resolve(REPO_ROOT, args.src ?? 'src')

  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    fail2(`产物目录不存在：${relPath(distDir)}\n  先跑 pnpm build（或 ./init.ps1），scan 只读构建产物。`)
  }
  const cssFiles = existsSync(join(distDir, 'static')) ? walk(join(distDir, 'static'), ['.css']) : []
  const jsFiles = existsSync(join(distDir, 'static')) ? walk(join(distDir, 'static'), ['.js']) : []
  if (cssFiles.length === 0 || jsFiles.length === 0) {
    fail2(
      `产物不完整：${relPath(distDir)}/static 下 CSS ${cssFiles.length} 个、JS ${jsFiles.length} 个。\n` +
        '  dist 可能正被构建清空或重建，重跑一次；一直空就跑 pnpm build。'
    )
  }

  const findings = []
  const push = (finding) => findings.push(finding)
  for (const file of cssFiles) scanCss(relPath(file), readFileSync(file, 'utf8'), push)
  for (const file of jsFiles) scanJs(relPath(file), readFileSync(file, 'utf8'), push)
  const srcFiles = existsSync(srcDir) ? walk(srcDir, ['.ts', '.tsx', '.js', '.jsx']) : []
  for (const file of srcFiles) scanSrc(relPath(file), readFileSync(file, 'utf8'), push)

  // 兜底检测只看入口 chunk：它由 index.html 直接 load，先于任何异步 chunk 执行
  const mainChunk = jsFiles.find((file) => /^main\.[\w-]+\.js$/.test(basename(file)))
  const mainText = mainChunk ? readFileSync(mainChunk, 'utf8') : ''
  const fallbackIn = (api) => {
    const probes = FALLBACK_PROBES[api]
    if (!probes || !mainText) return null
    return probes.some((probe) => probe.test(mainText)) ? relPath(mainChunk) : null
  }
  for (const finding of findings) {
    if (finding.rule !== 'js-new-api' || !finding.api) continue
    const where = fallbackIn(finding.api)
    if (!where) continue
    finding.severity = 'info'
    finding.fallbackIn = where
  }

  const kept = []
  const skipped = []
  for (const finding of findings) {
    const exemption = exempted(finding)
    if (exemption) skipped.push({ ...finding, reason: exemption.reason, fallback: exemption.fallback })
    else kept.push(finding)
  }
  kept.sort((a, b) => (a.file === b.file ? a.offset - b.offset : a.file < b.file ? -1 : 1))

  const errors = kept.filter((f) => f.severity === 'error')
  const hints = kept.filter((f) => f.severity === 'hint')
  const infos = kept.filter((f) => f.severity === 'info')

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: errors.length === 0,
          targetKernel: TARGET_KERNEL,
          scanned: { dist: relPath(distDir), src: relPath(srcDir), css: cssFiles.length, js: jsFiles.length, source: srcFiles.length },
          counts: { error: errors.length, hint: hints.length, info: infos.length, exempted: skipped.length },
          findings: kept,
          exempted: skipped,
        },
        null,
        2
      )}\n`
    )
  } else {
    printReport({ distDir, srcDir, cssFiles, jsFiles, srcFiles, kept, skipped })
  }

  process.exit(errors.length === 0 ? 0 : 1)
}

const printReport = ({ distDir, srcDir, cssFiles, jsFiles, srcFiles, kept, skipped }) => {
  const lines = []
  lines.push(`scan-compat · 目标内核 ${TARGET_KERNEL}`)
  lines.push(`  扫 ${relPath(distDir)}：${cssFiles.length} 个 CSS、${jsFiles.length} 个 JS`)
  lines.push(`  扫 ${relPath(srcDir)}：${srcFiles.length} 个源码文件（只查 UA 版本判断）`)
  lines.push('')

  const blocking = kept.filter((finding) => finding.severity !== 'info')
  const fallenBack = kept.filter((finding) => finding.severity === 'info')

  if (blocking.length === 0 && fallenBack.length === 0) {
    lines.push('干净：没有有内核门槛的裸用。')
  } else {
    let currentFile = null
    for (const finding of blocking) {
      if (finding.file !== currentFile) {
        if (currentFile !== null) lines.push('')
        currentFile = finding.file
        lines.push(currentFile)
      }
      const rule = RULES[finding.rule]
      const tag = finding.severity === 'error' ? 'error' : 'hint '
      lines.push(`  ${tag}  ${ruleKey(finding)}  L${finding.line}:${finding.column}（offset ${finding.offset}）`)
      if (finding.detail) lines.push(`        ${finding.detail}`)
      lines.push(`        命中：${finding.excerpt}`)
      lines.push(`        为什么要报：${rule.why}`)
      lines.push(`        怎么修：${rule.fix}`)
    }
    if (blocking.length > 0) lines.push('')
  }

  if (fallenBack.length > 0) {
    const where = [...new Set(fallenBack.map((finding) => finding.fallbackIn))]
    lines.push(`有兜底的调用（info，不阻断）：入口 chunk ${where.join('、')} 里有兜底代码，旧内核走降级路径。`)
    for (const finding of fallenBack) {
      lines.push(`  ${ruleKey(finding)}  ${finding.file} L${finding.line}:${finding.column}  ${finding.detail ?? ''}`)
    }
    lines.push('')
  }

  if (skipped.length > 0) {
    lines.push('豁免（写在 EXEMPTIONS 里，提交信息必须写理由）：')
    for (const finding of skipped) {
      lines.push(`  ${ruleKey(finding)}  ${finding.file}  ← ${finding.reason}`)
      if (finding.fallback) lines.push(`      兜底：${finding.fallback}`)
    }
    lines.push('')
  }

  const byRule = new Map()
  for (const finding of kept) byRule.set(ruleKey(finding), (byRule.get(ruleKey(finding)) ?? 0) + 1)
  const errors = kept.filter((f) => f.severity === 'error').length
  const hints = kept.filter((f) => f.severity === 'hint').length
  const infos = kept.filter((f) => f.severity === 'info').length
  lines.push(`汇总：error ${errors} / hint ${hints} / info ${infos} / 豁免 ${skipped.length}`)
  for (const [key, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
    const label = RULES[key.split(':')[0]].label
    lines.push(`  ${key.includes(':') ? key : label}：${count}`)
  }
  lines.push(errors === 0 ? '退出码 0：可以继续。' : `退出码 1：${errors} 处有内核门槛的裸用，旧内核上会静默失效。`)
  process.stdout.write(`${lines.join('\n')}\n`)
}

const fail2 = (message) => {
  process.stderr.write(`scan-compat: ${message}\n`)
  process.exit(2)
}

try {
  main()
} catch (error) {
  process.stderr.write(`scan-compat: 脚本自身出错 —— ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
}
