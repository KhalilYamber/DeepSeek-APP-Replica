/**
 * structuredClone 要 Chrome 98+，Chromium 93 上是 undefined，mermaid 一渲染图表就抛 TypeError。
 * 兜底走 JSON 深拷贝：Date 会变成字符串、undefined 属性会丢失、Map/Set 与循环引用不支持。
 * mermaid 拿它克隆的是纯配置对象，上面几类都不出现，所以够用。
 */
export const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = jsonClone
}

/**
 * Object.hasOwn 要 Chrome 93+。它出现在启动路径上（会话与会话摘要都在用），
 * 老内核缺这个成员会直接抛 TypeError——整个界面挂掉，比样式错位严重得多。
 */
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = (target: object, key: PropertyKey): boolean =>
    Object.prototype.hasOwnProperty.call(target, key)
}

/**
 * Array/String.prototype.at 要 Chrome 92+。用 defineProperty 装，
 * 避免直接赋值留下一个可被 for...in 枚举到的成员。
 */
const defineAt = (proto: object) => {
  Object.defineProperty(proto, 'at', {
    value: function at(this: { length: number; [index: number]: unknown }, index: number) {
      const length = this.length
      const i = index < 0 ? length + index : index
      return i < 0 || i >= length ? undefined : this[i]
    },
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

if (typeof Array.prototype.at !== 'function') {
  defineAt(Array.prototype)
}

if (typeof String.prototype.at !== 'function') {
  defineAt(String.prototype)
}
