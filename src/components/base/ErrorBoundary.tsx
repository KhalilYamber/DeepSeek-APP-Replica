import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { logDiagnostic } from '../../services/diagnostics.js'
import { Button } from './Button.js'
import styles from './ErrorBoundary.module.css'

export type ErrorFallbackProps = { error: Error; retry: () => void }

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value))

/** 默认兜底卡片：出错的那一块自己解释自己，并给两个能点的东西 */
const DefaultFallback = ({
  error,
  retry,
  compact,
}: ErrorFallbackProps & { compact?: boolean }) => {
  const t = useTranslate()
  return (
    <div className={compact ? `${styles.box} ${styles.compact}` : styles.box} role="alert">
      <div className={styles.title}>
        {compact ? t('renderFailedTitleCompact') : t('renderFailedTitle')}
      </div>
      <div className={styles.detail}>{error.message || t('renderFailedUnknown')}</div>
      <div className={styles.actions}>
        <Button variant="outlined" size="s" onClick={retry}>
          {t('retry')}
        </Button>
        {compact ? null : (
          <Button variant="outlined" size="s" onClick={() => location.reload()}>
            {t('reload')}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * 一块出错的保险丝：只断这一块，不让 React 18 把整棵树卸掉。
 *
 * 为什么必须有：React 18 里渲染期未捕获的异常会卸载整个根节点——一条消息的公式或图表
 * 解析失败，代价是整个界面变白，连侧栏和设置一起没。这里把「整屏」降级成「一块」。
 *
 * retry 会把子树换 key 重挂，顺带清掉子树状态；同一份坏数据会再次被拦住，不会变成死循环。
 */
export class ErrorBoundary extends Component<
  { scope: string; compact?: boolean; children: ReactNode },
  { error: Error | null; attempt: number }
> {
  override state = { error: null as Error | null, attempt: 0 }

  static getDerivedStateFromError(error: unknown) {
    return { error: toError(error) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // 记进本机诊断（设置 → 诊断信息可复制），不往任何服务器发
    logDiagnostic('render', `${this.props.scope}: ${error.message}${info.componentStack ?? ''}`)
  }

  private retry = () => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }))
  }

  override render() {
    const { error, attempt } = this.state
    if (error) {
      return <DefaultFallback error={error} retry={this.retry} compact={this.props.compact} />
    }
    return <Fragment key={attempt}>{this.props.children}</Fragment>
  }
}
