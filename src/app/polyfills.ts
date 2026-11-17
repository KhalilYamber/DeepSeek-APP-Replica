/**
 * structuredClone 要 Chrome 98+，Chromium 93 上是 undefined，mermaid 一渲染图表就抛 TypeError。
 * 兜底走 JSON 深拷贝：Date 会变成字符串、undefined 属性会丢失、Map/Set 与循环引用不支持。
 * mermaid 拿它克隆的是纯配置对象，上面几类都不出现，所以够用。
 */
export const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = jsonClone
}
