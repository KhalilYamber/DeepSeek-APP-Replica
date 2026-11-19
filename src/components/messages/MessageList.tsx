import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { ErrorBoundary } from '../base/ErrorBoundary.js'
import { AssistantMessage } from './AssistantMessage.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import type { Message } from '../../services/chat/types.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}
import styles from './MessageList.module.css'

/** 距底部小于该值时视为在底部，流式内容增长时跟随 */
const STICKY_THRESHOLD = 40
/** 超过这么多条消息才启用 content-visibility：短会话收益小、风险不划算 */
const LONG_LIST_COUNT = 200
/** 离底超过一屏的这么多倍，才显示「回到底部」浮标——小幅度往上翻不打扰 */
const JUMP_BUTTON_RATIO = 0.25
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
}: {
  session: Session
  streaming: boolean
  footer: React.ReactNode
}) => {
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  /** 滚动时只读缓存：在 scroll 回调里读 scrollHeight/clientHeight 会强制布局，手机上每帧都付一次。 */
  const metricsRef = useRef({ scrollHeight: 0, clientHeight: 0 })
  /** 是否已经贴在底部；只在真假切换时更新，避免滚动时每帧重渲染整列消息 */
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  const messages = getVisibleMessages(session)
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }
  const lastMessageId = messages.at(-1)?.id
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el && stickyRef.current) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  /** 用户点浮标：强制回到底部，并把跟随重新打开（之后新回答会跟住） */
  const jumpToBottom = useCallback(() => {
    stickyRef.current = true
    atBottomRef.current = true
    setAtBottom(true)
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  const scrollApi = useMemo(
    () => ({ scrollToBottom, jumpToBottom, atBottom }),
    [scrollToBottom, jumpToBottom, atBottom]
  )

  // 内容、键盘和输入框高度变化时，继续遵循当前跟随状态。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const measure = () => {
      metricsRef.current = { scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight }
    }
    const syncAtBottom = () => {
      const { scrollHeight, clientHeight } = metricsRef.current
      const gap = scrollHeight - scroll.scrollTop - clientHeight
      const next = gap <= clientHeight * JUMP_BUTTON_RATIO
      if (next !== atBottomRef.current) {
        atBottomRef.current = next
        setAtBottom(next)
      }
    }
    const onResize = () => {
      measure()
      scrollToBottom()
      syncAtBottom()
    }
    measure()
    const observer = new ResizeObserver(onResize)
    observer.observe(content)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, scrollToBottom])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
      }
      restoreScrollRef.current = null
      return
    }
    stickyRef.current = true
    atBottomRef.current = true
    setAtBottom(true)
    scrollToBottom()
  }, [session.id, lastMessageId, scrollToBottom])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
      restoreScrollRef.current = { messageId, top: anchorTop }
      stickyRef.current = false
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
    },
    [session.id, streaming]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
    }
    const onScroll = () => {
      const { scrollHeight, clientHeight } = metricsRef.current
      const gap = scrollHeight - el.scrollTop - clientHeight
      const nearBottom = gap < STICKY_THRESHOLD
      // 仅在用户向上滚动时停止跟随底部，布局或内容增高时保持跟随状态。
      if (nearBottom) {
        stickyRef.current = true
      } else if (el.scrollTop < scrollTopRef.current) {
        stickyRef.current = false
      }
      scrollTopRef.current = el.scrollTop
      const next = gap <= clientHeight * JUMP_BUTTON_RATIO
      if (next !== atBottomRef.current) {
        atBottomRef.current = next
        setAtBottom(next)
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollToBottom])

  const lastIndex = messages.length - 1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  return (
    <ScrollToBottomContext.Provider value={scrollApi}>
      <div ref={isMobile ? undefined : scrollRef} className={styles.container}>
        <div ref={isMobile ? scrollRef : undefined} className={styles.scroll}>
          <div
            ref={contentRef}
            className={clsx(styles.column, messages.length > LONG_LIST_COUNT && styles.longColumn)}
          >
            {messages.map((message, index) => (
              <ErrorBoundary key={message.id} scope="message" compact>
                {message.role === 'user' ? (
                  <UserMessage
                    sessionId={session.id}
                    message={message}
                    retryUploadId={uploadRetryId}
                    isFirst={index === 0}
                    isLast={index === lastIndex || index === lastIndex - 1}
                    busy={streaming}
                    versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                    onSelectVersion={selectVersion}
                  />
                ) : (
                  <AssistantMessage
                    sessionId={session.id}
                    message={message}
                    isLast={index === lastIndex}
                    streaming={streaming && index === lastIndex}
                    busy={streaming}
                    versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                    onSelectVersion={selectVersion}
                  />
                )}
              </ErrorBoundary>
            ))}
          </div>
        </div>
        {footer}
      </div>
    </ScrollToBottomContext.Provider>
  )
}
