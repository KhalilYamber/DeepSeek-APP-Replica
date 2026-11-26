import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { resolveSafeSide } from './safeArea.js'
import { resolveFrameOverride } from './viewportClamp.js'

/**
 * 按移动端布局的三种情况，逗号＝或：
 * 1. 宽不足 768px（手机竖屏、窄窗口）；
 * 2. 高不足 520px（手机横过来，键盘一弹就没有可用空间）；
 * 3. 宽 > 高 且 高不足 700px（小平板、折叠屏横过来）——放不下 261px 的常驻侧栏，
 *    判成桌面布局就会把会话区挤掉一块，所以也走抽屉。
 *
 * 与 CSS 里全仓 11 处 @media 是同一条件，改这里必须一起改（tools/measure-layout.mjs 守着两边的数字）。
 */
const query = window.matchMedia(
  'not all and (min-width: 768px), (max-height: 519px), (min-aspect-ratio: 1/1) and (max-height: 699px)'
)
/** 主指针是粗的（手指）：手机、平板、纯触屏设备。它们没有 Shift 键 */
const coarseQuery = window.matchMedia('(pointer: coarse)')
/** 主指针能悬停：鼠标、触控板。触屏设备通常为 none */
const hoverQuery = window.matchMedia('(hover: hover)')

const subscribeMedia = (media: MediaQueryList) => (onChange: () => void) => {
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

// 订阅函数必须稳定：useSyncExternalStore 把它当 effect 依赖，每次渲染新建一个就会退订重订。
// 输入框每敲一个字重渲染一次，这里不稳定等于每个字重挂一遍监听。
const subscribeMobile = subscribeMedia(query)
const subscribeCoarse = subscribeMedia(coarseQuery)
const subscribeHover = subscribeMedia(hoverQuery)

export const useIsMobile = () => useSyncExternalStore(subscribeMobile, () => query.matches)

/**
 * 这台设备是不是「以手指为主」。
 *
 * 不能只看 `(pointer: coarse)`：iPad 上的第三方浏览器（夸克一类）会把它报成细指针，
 * 于是回车被当成发送、输入框被自动聚焦，两个毛病一起回来。所以再补一条
 * 「有触摸点且不能悬停」的判据；带鼠标的触屏笔电因为 `hover: hover` 为真，不会误判。
 */
export const useTouchFirst = () => {
  const coarse = useSyncExternalStore(subscribeCoarse, () => coarseQuery.matches)
  const hover = useSyncExternalStore(subscribeHover, () => hoverQuery.matches)
  return coarse || (navigator.maxTouchPoints > 0 && !hover)
}

/**
 * 回车是否代表发送。
 *
 * 手指输入的设备没有 Shift 键，回车只能是换行；笔记本接鼠标时主指针是细的，保留回车发送。
 * 主判据仍是宽度与高度断点（与全仓 `@media` 是同一组数字），触屏判据只用来覆盖大屏触屏设备。
 */
export const useEnterSends = () => !useIsMobile() && !useTouchFirst()

/** 接管期间每秒复核一次：不少内核收键盘时既不发 resize 也不发 focusout */
const VIEWPORT_WATCH_MS = 1000
/** 键盘接管时打在这帧上的标记：CSS 靠它把定位改成贴着视觉视口，桌面布局也要 */
const FRAME_CLAMPED_ATTR = 'data-frame-clamped'

/**
 * 移动端页面跟随视觉视口，键盘弹出后顶栏和输入框仍留在可见区域。
 *
 * 判定交给 `resolveFrameOverride`（纯函数），这里只负责接线与复核：
 * 事件来了算一次，另外每秒兜底算一次——**写进去的坏值必须有人能撤掉**，
 * 这是「收键盘后整屏空白」那条路的关键。
 */
export const useMobileViewport = (enabled: boolean) => {
  const frameRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!enabled || !frame) {
      return
    }
    const viewport = window.visualViewport
    let animationFrame = 0
    let watchTimer = 0

    const read = () => ({
      innerHeight: window.innerHeight,
      visualHeight: viewport?.height,
      offsetTop: viewport?.offsetTop,
      scale: viewport?.scale,
    })

    // 只在值真的变了才写，避免每秒复核都触发一次样式重算
    const setStyle = (name: string, value: string) => {
      if (frame.style.getPropertyValue(name) === value) {
        return
      }
      if (value) {
        frame.style.setProperty(name, value)
        return
      }
      frame.style.removeProperty(name)
    }
    /**
     * 三个值一起写，理由是各有一个消费者：
     * - 内联 `height`：优先级最高，也是唯一真正决定高度的东西。哪怕别处把它写成坏值，
     *   每秒复核也会按实测覆盖回来（「height 依赖 dvh 导致塌成 0」那条路的兜底）。
     * - `--app-viewport-height`：输入框的 max-height 在用它。
     * - `--app-viewport-top`：CSS 里 fixed 元素的 top。
     */
    const write = (height: string, top: string) => {
      setStyle('height', height)
      setStyle('--app-viewport-height', height)
      setStyle('--app-viewport-top', top)
    }

    const apply = () => {
      const decision = resolveFrameOverride(read())
      if (decision.mode === 'keep') {
        return
      }
      if (decision.mode === 'css') {
        // 没键盘：按布局视口取全高，同样用像素写——高度从此不依赖 dvh 这类新单位
        frame.removeAttribute(FRAME_CLAMPED_ATTR)
        const height = Math.round(window.innerHeight)
        write(height > 0 ? `${height}px` : '', height > 0 ? '0px' : '')
        return
      }
      // 键盘把可见区域压矮了：让 CSS 把这帧改成「贴着视觉视口」的定位。
      // iPad 横屏走的是桌面布局，那条定位规则原先只在移动端 @media 里，这里靠属性补上。
      frame.setAttribute(FRAME_CLAMPED_ATTR, '')
      write(`${decision.height}px`, `${decision.top}px`)
    }
    const scheduleFrame = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(apply)
    }
    const schedule = () => {
      // 先同步跟上键盘动画，下一帧再校准延迟更新的视口读数
      apply()
      scheduleFrame()
    }
    const onFocusChange = () => scheduleFrame()
    const onVisibilityChange = () => apply()

    schedule()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    document.addEventListener('focusin', onFocusChange)
    document.addEventListener('focusout', onFocusChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    watchTimer = window.setInterval(apply, VIEWPORT_WATCH_MS)

    return () => {
      cancelAnimationFrame(animationFrame)
      window.clearInterval(watchTimer)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      document.removeEventListener('focusin', onFocusChange)
      document.removeEventListener('focusout', onFocusChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      frame.removeAttribute(FRAME_CLAMPED_ATTR)
      write('', '')
    }
  }, [enabled])

  return frameRef
}

/** 布局突变（转屏、键盘、窗口缩放）期间临时关掉过渡，避免闪与晕 */
const LAYOUT_CHANGE_CLASS = 'change-layout'
const LAYOUT_CHANGE_HOLD_MS = 120
/** 安全边距只由样式解析（APK 里是 Capacitor 注入的变量），借这个隐形探针把它读成像素值（样式见 global.css） */
const SAFE_AREA_PROBE_CLASS = 'safe-area-probe'

const readSideInsets = () => {
  const probe = document.createElement('div')
  probe.className = SAFE_AREA_PROBE_CLASS
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const insets = {
    left: parseFloat(style.paddingLeft) || 0,
    right: parseFloat(style.paddingRight) || 0,
  }
  probe.remove()
  return insets
}

/** 把横屏镜像安全边距写进 `--app-safe-side`，并在布局突变期间压住过渡 */
export const useViewportLayoutSync = () => {
  useLayoutEffect(() => {
    const root = document.documentElement
    let insets = readSideInsets()
    let landscape = window.innerWidth > window.innerHeight
    let holdTimer = 0
    const syncSafeSide = (refetchInsets: boolean) => {
      const next = window.innerWidth > window.innerHeight
      // 安全区只在转屏时变；orientationchange 可能早于新视口尺寸，缩到尺寸稳定再读一次
      if (refetchInsets || next !== landscape) {
        insets = readSideInsets()
      }
      landscape = next
      root.style.setProperty(
        '--app-safe-side',
        `${resolveSafeSide(insets.left, insets.right, landscape)}px`
      )
    }
    const holdTransitions = () => {
      document.body.classList.add(LAYOUT_CHANGE_CLASS)
      window.clearTimeout(holdTimer)
      holdTimer = window.setTimeout(() => {
        document.body.classList.remove(LAYOUT_CHANGE_CLASS)
      }, LAYOUT_CHANGE_HOLD_MS)
    }
    const onResize = () => {
      holdTransitions()
      syncSafeSide(false)
    }
    const onOrientationChange = () => {
      holdTransitions()
      syncSafeSide(true)
    }

    syncSafeSide(true)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onOrientationChange)
    return () => {
      window.clearTimeout(holdTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onOrientationChange)
      document.body.classList.remove(LAYOUT_CHANGE_CLASS)
      root.style.removeProperty('--app-safe-side')
    }
  }, [])
}
