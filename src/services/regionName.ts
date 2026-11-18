/**
 * `Intl.DisplayNames` 要 Chrome 81+，而本项目的语法目标是 Chrome 70。
 *
 * 为什么单独抽出来：它原来写在 `location.ts` 的**模块顶层**，而 `location.ts` 在启动主链上
 * （`App` → `services/settings` → `services/location`）。Chrome 70–80 上 `Intl.DisplayNames`
 * 是 `undefined`，`new undefined()` 抛 TypeError，整个主包在模块求值阶段就停了——界面一个像素都不出来，
 * 而且报错发生在 React 之前，任何 React 层兜底都来不及。
 *
 * 所以这里只做一件事：**用到才建，建不出来返回 null**，让调用方退回原始代码。
 */

/** 与 `Intl.DisplayNames.of()` 同形，够调用方用就行 */
export type RegionNameFormatter = { of: (code: string) => string | undefined }

/**
 * 建一个区域名格式化器；宿主没有 `Intl.DisplayNames`（旧内核）或构造失败（ICU 数据不全）时返回 null。
 * 这个函数只允许返回 null 或可用对象，**永远不抛**——它站在启动主链上，抛一次就是白屏。
 */
export const createRegionFormatter = (locale: string): RegionNameFormatter | null => {
  const DisplayNames = typeof Intl === 'undefined' ? undefined : Intl.DisplayNames
  if (typeof DisplayNames !== 'function') {
    return null
  }
  try {
    return new DisplayNames([locale], { type: 'region' })
  } catch {
    return null
  }
}
