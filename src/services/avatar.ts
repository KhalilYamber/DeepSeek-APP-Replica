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
