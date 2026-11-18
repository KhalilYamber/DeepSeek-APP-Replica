/**
 * 移动端根容器「跟随视觉视口」的取值规则。
 *
 * 背景：键盘弹出时布局视口不一定变，只有视觉视口（visualViewport）会缩。
 * 原来的写法是「只要焦点在输入框里，就把 visualViewport 的 height / offsetTop 原样写进 CSS 变量」，
 * 三处风险：任何输入框都能触发（连设置弹窗里挂在 body 上的那个也算）；读数是 0 / NaN / 越界时照写；
 * 写进去之后没有任何东西复核——收键盘不发事件时，坏值就永久留在变量上，表现是整屏空白。
 *
 * 这里只做一件事：**给一组读数，回答要不要接管、接管成多少**。纯函数，好测。
 */

export type ViewportReading = {
  /** window.innerHeight：布局视口高度 */
  innerHeight: number
  /** visualViewport.height；不支持 visualViewport 时是 undefined */
  visualHeight?: number
  /** visualViewport.offsetTop：视觉视口相对布局视口被推下去的距离（iOS 收键盘时非 0） */
  offsetTop?: number
  /** visualViewport.scale：双指缩放时布局尺寸由浏览器接管，我们不该动 */
  scale?: number
}

export type FrameOverride =
  /** 缩放进行中：保持现状，一个像素都别改 */
  | { mode: 'keep' }
  /** 交回 CSS 的 100vh / 100dvh（没键盘，或读数不可信） */
  | { mode: 'css' }
  /** 接管：把根容器钉在视觉视口上 */
  | { mode: 'pin'; height: number; top: number }

/** 视觉视口低于布局视口的这个比例，才认定为「键盘真的弹出来了」；地址栏 / 工具栏挤一下不算 */
const KEYBOARD_TRIGGER_RATIO = 0.75
/** 低于这个比例说明读数是坏的（旧内核会报 0 或极小值），宁可不管也不要照着写 */
const MIN_HEIGHT_RATIO = 0.25

const finite = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const resolveFrameOverride = (reading: ViewportReading): FrameOverride => {
  const { innerHeight, visualHeight, offsetTop, scale } = reading

  // 缩放中：读数按比例缩过，看着像「键盘弹了」，照着写会把界面压扁
  if (finite(scale) && scale !== 1) {
    return { mode: 'keep' }
  }
  if (!finite(innerHeight) || innerHeight <= 0) {
    return { mode: 'css' }
  }
  if (!finite(visualHeight) || visualHeight <= 0) {
    return { mode: 'css' }
  }
  // 没键盘：高度和布局视口一样高，交回 CSS
  if (visualHeight >= innerHeight) {
    return { mode: 'css' }
  }
  // 读数不可能成立：丢弃，别照着写
  if (visualHeight < innerHeight * MIN_HEIGHT_RATIO) {
    return { mode: 'css' }
  }
  // 只是地址栏 / 工具栏在动：不值得接管
  if (visualHeight > innerHeight * KEYBOARD_TRIGGER_RATIO) {
    return { mode: 'css' }
  }

  const height = Math.round(visualHeight)
  // top 必须落在 [0, innerHeight - height]：负值、超出余量都夹回来
  const room = innerHeight - height
  const rawTop = finite(offsetTop) ? Math.round(offsetTop) : 0
  const top = Math.min(Math.max(rawTop, 0), room)
  return { mode: 'pin', height, top }
}
