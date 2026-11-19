import { useTranslate } from '../../i18n/index.js'
import { IconChevronDownOutline14 } from '../base/icons.js'
import { useScrollToBottom } from './scrollContext.js'
import styles from './ScrollToBottomButton.module.css'

/**
 * 「回到底部」浮标：离底部一屏以上时出现，点一下回到最新一条并恢复跟随。
 * 放在输入框容器里（绝对定位到底部上方），这样它不跟着消息一起滚。
 */
export const ScrollToBottomButton = () => {
  const t = useTranslate()
  const { jumpToBottom, atBottom } = useScrollToBottom()
  if (atBottom) {
    return null
  }
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('scrollToBottom')}
      onClick={jumpToBottom}
    >
      <IconChevronDownOutline14 />
    </button>
  )
}
