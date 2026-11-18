import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { resolveSafeSide } from './safeArea.js'

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

const subscribe = (onChange: () => void) => {
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export const useIsMobile = () => useSyncExternalStore(subscribe, () => query.matches)

const preventPageScroll = (event: TouchEvent) => {
  if (event.touches.length !== 1) {
    return
  }
  event.preventDefault()
}

/** 指针是否落在可滚动区域里（手里这一次手势，只在 touchstart 算一次）。 */
const startsInScroller = (target: EventTarget | null): boolean => {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== document.body;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element)
    const scrollsY =
      /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight
    const scrollsX =
      /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth
    if (scrollsY || scrollsX) {
      return true
    }
  }
  return false
}

/**
 * 支持 overscroll-behavior 的内核上，整页滚动已经完全由 CSS 管住
 * （global.css 里 html/body/#root 的 height:100% + overflow:hidden + overscroll-behavior-y:none），
 * 这条 JS 拦截纯属多余——而它是 passive:false，会让浏览器每帧等 JS 算完才敢滚，
 * 真机上表现为「滑动发黏」。所以这类内核直接不挂监听。
 */
const cssManagesPageScroll = (): boolean =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('overscroll-behavior', 'none')

/** 阻止移动端整页滚动，保留内部可滚动区域的滚动和双指缩放。 */
export const usePreventPageScroll = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) {
      return
    }
    if (cssManagesPageScroll()) {
      return
    }
    // 老内核没有 overscroll-behavior，仍要用 JS 拦。
    // 但把「扫祖元素量样式」挪到 touchstart：手势一开始算一次，
    // touchmove 里只读一个布尔值，不再做 getComputedStyle 与布局读取。
    let inScroller = false
    const onTouchStart = (event: TouchEvent) => {
      inScroller = event.touches.length === 1 && startsInScroller(event.target)
    }
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && !inScroller) {
        preventPageScroll(event)
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [enabled])
}

/** 移动端页面跟随视觉视口，键盘弹出后顶栏和输入框仍留在可见区域。 */
export const useMobileViewport = (enabled: boolean) => {
  const frameRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!enabled || !frame) {
      return
    }
    const viewport = window.visualViewport
    const inputSelector = 'textarea, input:not([type="file"])'
    let animationFrame = 0
    const reset = () => {
      frame.style.removeProperty('--app-viewport-height')
      frame.style.removeProperty('--app-viewport-top')
    }
    const update = () => {
      // 双指缩放由浏览器处理，保持当前布局尺寸。
      if (viewport && viewport.scale !== 1) {
        return
      }
      // 失焦后直接恢复 CSS 的全高布局，不等 Safari 收键盘后的 resize。
      if (!document.activeElement?.matches(inputSelector)) {
        reset()
        return
      }
      frame.style.setProperty(
        '--app-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`
      )
      frame.style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`)
    }
    const scheduleFrame = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(update)
    }
    const schedule = () => {
      // 先同步跟上键盘动画，下一帧再校准 Safari 延迟更新的视口读数。
      update()
      scheduleFrame()
    }
    const onFocusIn = () => {
      if (document.activeElement?.matches(inputSelector)) {
        schedule()
      }
    }

    update()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', onFocusIn)
    // 等点击和焦点切换完成，避免按钮移动、或切换输入框时短暂恢复全高。
    document.addEventListener('focusout', scheduleFrame)
    return () => {
      cancelAnimationFrame(animationFrame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', scheduleFrame)
      reset()
    }
  }, [enabled])

  return frameRef
}

/** 布局突变（转屏、键盘、窗口缩放）期间临时关掉过渡，避免闪与晕 */
const LAYOUT_CHANGE_CLASS = 'change-layout'
const LAYOUT_CHANGE_HOLD_MS = 120
/** env() 只由样式解析，借这个隐形探针把它读成像素值（样式见 global.css） */
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
