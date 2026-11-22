import { create } from 'zustand'

const BG_KEY = 'chat-demo:chat-background'
const DIM_KEY = 'chat-demo:background-dim'
const ALPHA_KEY = 'chat-demo:bubble-alpha'

export const DEFAULT_DIM = 40
export const MAX_DIM = 80

/** 气泡透明度 20–90：低于 20 正文基本没法读，高于 90 就等于不透 */
export const MIN_BUBBLE_ALPHA = 20
export const MAX_BUBBLE_ALPHA = 90
export const DEFAULT_BUBBLE_ALPHA = 70

const readText = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 遮罩浓淡：认不出来或越界一律回默认，坏数据不会让背景变成纯黑或全透 */
export const parseDim = (raw: string | null): number => {
  const value = raw === null ? Number.NaN : Number(raw)
  if (!Number.isFinite(value)) {
    return DEFAULT_DIM
  }
  return Math.min(Math.max(Math.round(value), 0), MAX_DIM)
}

/** 气泡透明度：认不出来回默认 70，越界夹到 20–90；坏数据不会把气泡变全透或全实 */
export const parseBubbleAlpha = (raw: string | null): number => {
  if (raw === null || raw.trim() === '') {
    return DEFAULT_BUBBLE_ALPHA
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return DEFAULT_BUBBLE_ALPHA
  }
  return Math.min(Math.max(Math.round(value), MIN_BUBBLE_ALPHA), MAX_BUBBLE_ALPHA)
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用（隐私模式 / 配额满）时只在内存中生效
  }
}

type BackgroundStore = {
  image: string | null
  dim: number
  bubbleAlpha: number
}

export const useChatBackground = create<BackgroundStore>(() => ({
  image: readText(BG_KEY),
  dim: parseDim(readText(DIM_KEY)),
  bubbleAlpha: parseBubbleAlpha(readText(ALPHA_KEY)),
}))

const applyDim = (dim: number) => {
  try {
    document.documentElement.style.setProperty('--app-bg-dim', String(dim / 100))
  } catch {
    // 没有 document 的环境只做内存生效
  }
}

/** 透明度写成根元素的内联样式；CSS 那边只声明默认值，不覆盖它 */
const applyBubbleAlpha = (alpha: number) => {
  try {
    document.documentElement.style.setProperty('--app-bubble-alpha', String(alpha / 100))
  } catch {
    // 同上
  }
}

/**
 * 壁纸开关：有图时给 body 打上 data-chat-bg，CSS 才把各处底色换成半透明；
 * 没有图时撤掉标记并把透明度复位成 1——保证「没设壁纸」就是改之前的样子。
 */
const applySurfaceMode = () => {
  const { image, bubbleAlpha } = useChatBackground.getState()
  try {
    if (image) {
      document.body.dataset.chatBg = '1'
      applyBubbleAlpha(bubbleAlpha)
    } else {
      delete document.body.dataset.chatBg
      applyBubbleAlpha(100)
    }
  } catch {
    // 测试环境没有 document.body：只做内存生效
  }
}

export const setChatBackground = (dataUrl: string | null) => {
  write(BG_KEY, dataUrl)
  useChatBackground.setState({ image: dataUrl })
  applySurfaceMode()
}

export const setBackgroundDim = (dim: number) => {
  const next = parseDim(String(dim))
  write(DIM_KEY, String(next))
  useChatBackground.setState({ dim: next })
  applyDim(next)
}

export const setBubbleAlpha = (alpha: number) => {
  const next = parseBubbleAlpha(String(alpha))
  write(ALPHA_KEY, String(next))
  useChatBackground.setState({ bubbleAlpha: next })
  applyBubbleAlpha(next)
}

/** 首屏渲染前把遮罩浓度与壁纸标记写好，避免先按默认值画一帧 */
export const initChatBackground = () => {
  applyDim(useChatBackground.getState().dim)
  applySurfaceMode()
}
