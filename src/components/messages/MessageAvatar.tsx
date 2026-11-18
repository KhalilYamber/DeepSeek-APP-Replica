import clsx from 'clsx'
import { useAvatars, type AvatarRole } from '../../services/avatar.js'
import styles from './MessageAvatar.module.css'

/** 消息旁的圆形头像；没设过就显示一个默认的圆底字，不占额外请求。 */
export const MessageAvatar = ({ role }: { role: AvatarRole }) => {
  const src = useAvatars((state) => state[role])
  const className = clsx(
    styles.avatar,
    role === 'user' ? styles.right : styles.left,
    role === 'user' ? styles.userFallback : styles.assistantFallback
  )
  if (src) {
    return <img className={className} src={src} alt="" aria-hidden />
  }
  return (
    <span className={className} aria-hidden>
      {role === 'user' ? '我' : 'AI'}
    </span>
  )
}
