import { create } from 'zustand'

export type AvatarRole = 'user' | 'assistant'

const KEYS: Record<AvatarRole, string> = {
  user: 'chat-demo:avatar-user',
  assistant: 'chat-demo:avatar-assistant',
}

/** 存下来的边长（像素）。头像显示只有 32px，160 足够高清屏，也压得住体积。 */
export const AVATAR_SIZE = 160

const read = (role: AvatarRole): string | null => {
  try {
    return localStorage.getItem(KEYS[role])
  } catch {
    return null
  }
}

const write = (role: AvatarRole, dataUrl: string | null) => {
  try {
    if (dataUrl === null) {
      localStorage.removeItem(KEYS[role])
    } else {
      localStorage.setItem(KEYS[role], dataUrl)
    }
  } catch {
    // 存储不可用（隐私模式 / 配额满）时只在内存中生效，界面其它部分不受影响
  }
}

/** 头像存成本地 dataURL：两条各几十 KB，放 localStorage 足够，不用为它改数据库版本。 */
type AvatarState = Record<AvatarRole, string | null>

export const useAvatars = create<AvatarState>(() => ({
  user: read('user'),
  assistant: read('assistant'),
}))

export const setAvatar = (role: AvatarRole, dataUrl: string | null) => {
  write(role, dataUrl)
  useAvatars.setState({ [role]: dataUrl })
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    image.src = url
  })

/**
 * 把任意照片压成方形头像：取中间的正方形区域，缩到 AVATAR_SIZE，再编码成 JPEG。
 * 用 Image + canvas 而不是 createImageBitmap——后者在旧 Safari 上不可用，
 * 而 iOS 正好是这批用户的主要来源。
 */
export const fileToAvatar = async (file: File): Promise<string> => {
  const image = await loadImage(file)
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  if (!side) {
    throw new Error('empty image')
  }
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('canvas unavailable')
  }
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  )
  return canvas.toDataURL('image/jpeg', 0.85)
}
