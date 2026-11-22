import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useEffect, useState } from 'react'
import {
  IconChevronDownOutline14,
  IconRefreshOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { LONG_MESSAGE_CHARS, groupDigits, previewMarkdown } from '../../utils/longMessage.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { MessageAvatar } from './MessageAvatar.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  // 单条回复过长时先折叠：一条 20 万字的回复实测首帧 3.5 秒，整条渲染会把主线程占死，
  // 而 content-visibility 只能跳过「屏幕外的消息」，管不到一条消息内部。
  const [expandedLong, setExpandedLong] = useState(false)
  // 这条消息是在本次会话里边流式边长出来的：结束时不能突然折起来，否则
  // 用户正读着的内容会缩掉、滚动位置也跳；渲染成本在流式过程中已经付过了。
  const [streamedHere, setStreamedHere] = useState(false)
  useEffect(() => {
    if (streaming) {
      setStreamedHere(true)
    }
  }, [streaming])
  const answerMarkdown = answer?.markdown ?? ''
  const longCollapsed =
    !streaming && !streamedHere && !expandedLong && answerMarkdown.length > LONG_MESSAGE_CHARS
  // 展开要先把「展开中…」画出来，再让那条几万字的消息去渲染；
  // 否则点击到重绘之间主线程被占死，界面看起来像没反应。
  const [expanding, setExpanding] = useState(false)
  const beginExpand = () => {
    if (expanding) {
      return
    }
    setExpanding(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setExpandedLong(true)
        setExpanding(false)
      })
    })
  }
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  // 头像网页版与 APK 都显示（原先按「只给网页版」用 isNativeApp() 挡掉，2026-11-19 打开）
  return (
    <div className={clsx(styles.message, styles.withAvatar)}>
      <MessageAvatar role="assistant" />
      <div className={styles.body} data-role="answer-bubble">
        {refused ? null : (
          <ReplyArea
            message={message}
            view={view}
            streaming={streaming}
            hasResponse={!!responseText}
          />
        )}
        {expandedLong && answerMarkdown.length > LONG_MESSAGE_CHARS ? (
          <div className={styles.collapseRow}>
            <button
              type="button"
              className={clsx(styles.expandLong, styles.collapseLong)}
              aria-expanded
              onClick={() => setExpandedLong(false)}
            >
              <IconChevronDownOutline14 />
              <span>{t('longMessageCollapse')}</span>
            </button>
          </div>
        ) : null}
        {answer ? (
          <Markdown
            className="ds-assistant-message-main-content"
            content={longCollapsed ? previewMarkdown(answerMarkdown) : answer.markdown}
            loading={streaming}
            cacheKey={longCollapsed ? `${message.id}-preview` : message.id}
            disableLink={false}
            sources={view.sources}
          />
        ) : null}
        {longCollapsed ? (
          <button
            type="button"
            className={styles.expandLong}
            aria-expanded={false}
            disabled={expanding}
            onClick={beginExpand}
          >
            <IconChevronDownOutline14 />
            <span>
              {expanding
                ? t('longMessageExpanding')
                : t('longMessageExpand', { chars: groupDigits(answerMarkdown.length) })}
            </span>
          </button>
        ) : null}
        {waiting ? (
          <div className={styles.waiting}>
            {[0, 1, 2].map((index) => (
              <span key={index} className={styles.waitingDot} />
            ))}
          </div>
        ) : null}
        {notice?.presentation === 'response' ? (
          <Markdown
            className="ds-assistant-message-main-content"
            content={notice.text}
            loading={false}
            cacheKey={`${message.id}-template`}
            disableLink={false}
          />
        ) : notice ? (
          <div className={styles.notice}>
            <IconWarningOutline16 />
            <span>
              {notice.text}
              {notice.action === 'apiKey' ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className={styles.noticeAction}
                    onClick={() => openSettings('data')}
                  >
                    {t('changeApiKey')}
                  </button>
                </>
              ) : null}
              {notice.action === 'topUp' ? (
                <>
                  {' '}
                  <a
                    className={styles.noticeAction}
                    href={TOP_UP_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('topUp')}
                  </a>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
        {!streaming && !refused && view.searchResults.length > 0 ? (
          <div
            className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
            onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
          >
            <SiteThumbnails sources={view.searchResults} />
            <span>
              {t(
                view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
                { count: view.searchResults.length }
              )}
            </span>
          </div>
        ) : null}
        {streaming ? null : (
          <div className={styles.bottom}>
            <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
            <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
              {copyText ? <CopyButton text={copyText} /> : null}
              {responseText && !refused ? (
                <ReadAloudButton messageId={message.id} text={responseText} />
              ) : null}
              <IconButton
                icon={<IconRefreshOutline16 />}
                tooltip={t('regenerate')}
                tooltipPlacement="bottom"
                disabled={busy || refused}
                onClick={() => {
                  stopReadAloud()
                  regenerateReply(sessionId, message.id)
                }}
              />
            </div>
            {isLast && canContinueReply(message) ? (
              <Button
                variant="outlined"
                size="s"
                className={styles.continueButton}
                disabled={busy}
                onClick={() => {
                  stopReadAloud()
                  continueReply(sessionId, message.id)
                }}
              >
                {t('continueGenerating')}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
})
