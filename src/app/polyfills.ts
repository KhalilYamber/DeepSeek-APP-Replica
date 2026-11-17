/**
 * 目标内核是 Chrome 70（见 rspack.config.ts 的 targets）。
 *
 * swc 只把「语法」降到 ES2017（?? ?. ??= 之类），不碰「API」：
 * 代码里调用的较新内建方法会原样留在产物里，老内核上到运行时才炸。
 * 本文件在 main.tsx 第一行被 import，是所有代码里最早执行的一段，
 * 所以每个垫片都必须自己先用老语法写，不能反过来依赖被垫的东西。
 */

/* ------------------------------------------------------------------ 根对象 */

/**
 * globalThis 要 Chrome 71+，而目标是 70。
 * 这条必须排在最前：下面每一行都要用它，它自己不能先崩。
 */
if (typeof globalThis === 'undefined') {
  // 老内核上 window 一定存在，用它补出 globalThis 这个别名
  ;(window as unknown as { globalThis: Window }).globalThis = window
}

/* ------------------------------------------------------------------ 深拷贝 */

/**
 * structuredClone 要 Chrome 98+，Chromium 93 上是 undefined，mermaid 一渲染图表就抛 TypeError。
 * 兜底走 JSON 深拷贝：Date 会变成字符串、undefined 属性会丢失、Map/Set 与循环引用不支持。
 * mermaid 拿它克隆的是纯配置对象，上面几类都不出现，所以够用。
 */
export const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = jsonClone
}

/* ------------------------------------------------------------ Object 上的方法 */

/**
 * Object.hasOwn 要 Chrome 93+。它出现在启动路径上（会话与会话摘要都在用），
 * 老内核缺这个成员会直接抛 TypeError——整个界面挂掉，比样式错位严重得多。
 */
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = (target: object, key: PropertyKey): boolean =>
    Object.prototype.hasOwnProperty.call(target, key)
}

/** Object.fromEntries 要 Chrome 73+ */
if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = <T>(entries: Iterable<readonly [PropertyKey, T]>): Record<PropertyKey, T> => {
    const result: Record<PropertyKey, T> = {}
    for (const [key, value] of entries) {
      result[key as string] = value
    }
    return result
  }
}

/* ------------------------------------------------------------- Promise 上的方法 */

/** Promise.allSettled 要 Chrome 76+；只用到 fulfilled/rejected 两个状态与 value/reason */
if (typeof Promise.allSettled !== 'function') {
  type Settled<T> =
    | { status: 'fulfilled'; value: T }
    | { status: 'rejected'; reason: unknown }
  Promise.allSettled = <T>(values: Iterable<T | PromiseLike<T>>): Promise<Settled<T>[]> =>
    Promise.all(
      Array.from(values, (value) =>
        Promise.resolve(value).then(
          (settled): Settled<T> => ({ status: 'fulfilled', value: settled }),
          (reason): Settled<T> => ({ status: 'rejected', reason })
        )
      )
    )
}

/* ------------------------------------------------------------- String 上的方法 */

/** 用 defineProperty 装原型方法，避免直接赋值留下一个可被 for...in 枚举到的成员 */
const defineBuiltin = (target: object, name: string, value: unknown) => {
  Object.defineProperty(target, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

/**
 * String.prototype.replaceAll 要 Chrome 85+。
 * 传字符串时按字面量全部替换；传正则时要求带 g 标志（与规范一致），否则抛错。
 */
if (typeof String.prototype.replaceAll !== 'function') {
  defineBuiltin(
    String.prototype,
    'replaceAll',
    function replaceAll(
      this: string,
      search: string | RegExp,
      replacement: string | ((substring: string, ...args: unknown[]) => string)
    ): string {
      if (typeof search !== 'string') {
        if (!search.global) {
          throw new TypeError('replaceAll 传正则时必须带 g 标志')
        }
        return this.replace(search, replacement as Parameters<string['replace']>[1])
      }
      // 字面量替换：用替换结果做分隔符拼接，避免把 replacement 里的 $& 之类当成特殊模式
      const parts = this.split(search)
      const text = typeof replacement === 'function' ? replacement(search) : replacement
      return parts.join(text)
    }
  )
}

/**
 * String.prototype.matchAll 要 Chrome 73+。
 * 返回迭代器；规范要求正则带 g 标志，否则抛错。
 */
if (typeof String.prototype.matchAll !== 'function') {
  defineBuiltin(
    String.prototype,
    'matchAll',
    function* matchAll(this: string, pattern: RegExp) {
      if (!pattern.global) {
        throw new TypeError('matchAll 传的正则必须带 g 标志')
      }
      // 复制一份，避免共用 lastIndex 干扰调用方（与规范行为一致）
      const regex = new RegExp(pattern.source, pattern.flags)
      let match: RegExpExecArray | null
      while ((match = regex.exec(this)) !== null) {
        yield match
        if (match[0] === '') {
          regex.lastIndex += 1
        }
      }
    }
  )
}

/**
 * Array/String.prototype.at 要 Chrome 92+。
 */
const defineAt = (proto: object) => {
  defineBuiltin(proto, 'at', function at(
    this: { length: number; [index: number]: unknown },
    index: number
  ) {
    const length = this.length
    const i = index < 0 ? length + index : index
    return i < 0 || i >= length ? undefined : this[i]
  })
}

if (typeof Array.prototype.at !== 'function') {
  defineAt(Array.prototype)
}

if (typeof String.prototype.at !== 'function') {
  defineAt(String.prototype)
}
