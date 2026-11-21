import { create } from 'zustand'

const BG_KEY = 'chat-demo:chat-background'
const DIM_KEY = 'chat-demo:background-dim'

export const DEFAULT_DIM = 40
export const MAX_DIM = 80

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
}

export const useChatBackground = create<BackgroundStore>(() => ({
  image: readText(BG_KEY),
  dim: parseDim(readText(DIM_KEY)),
}))

const applyDim = (dim: number) => {
  try {
    document.documentElement.style.setProperty('--app-bg-dim', String(dim / 100))
  } catch {
    // 没有 document 的环境只做内存生效
  }
}

export const setChatBackground = (dataUrl: string | null) => {
  write(BG_KEY, dataUrl)
  useChatBackground.setState({ image: dataUrl })
}

export const setBackgroundDim = (dim: number) => {
  const next = parseDim(String(dim))
  write(DIM_KEY, String(next))
  useChatBackground.setState({ dim: next })
  applyDim(next)
}

/** 首屏渲染前把遮罩浓度写进根元素，避免先按默认值画一帧 */
export const initChatBackground = () => {
  applyDim(useChatBackground.getState().dim)
}
