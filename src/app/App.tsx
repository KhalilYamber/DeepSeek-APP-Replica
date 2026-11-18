import { useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslate } from '../i18n/index.js'
import { setSiderCollapsed, useSettings } from '../services/settings.js'
import {
  useIsMobile,
  useMobileViewport,
  useViewportLayoutSync,
} from './viewport.js'
import { useNativeShell } from './useNativeShell.js'
import {
  bindChatPersistence,
  initChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import { onRequestRetry } from '../services/api/timeout.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏以独立抽屉管理开合状态
  const storedSiderCollapsed = useSettings((state) => state.siderCollapsed)
  const siderCollapsed = storedSiderCollapsed && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)

  useViewportLayoutSync()
  useNativeShell()

  // 从移动端布局切回桌面布局时保持折叠：转屏、拉宽窗口不该凭空冒出一条常驻侧栏。
  // 展开只由用户点 ≡ 触发，选择照旧写进设置持久化（setSiderCollapsed 是那条唯一的写入口）。
  const wasMobile = useRef(isMobile)
  useLayoutEffect(() => {
    if (wasMobile.current && !isMobile) {
      setSiderCollapsed(true)
    }
    wasMobile.current = isMobile
  }, [isMobile])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  // 自动重试不静默：弹一条轻提示，用户知道是网络抖了一下，不是界面卡住了
  useEffect(() => onRequestRetry(() => showToast({ key: 'requestRetrying' })), [])
  useEffect(bindChatPersistence, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    void initChat()
    // 首次打开先在设置里输入 API Key
    ensureApiKey()
  }, [])

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? <MobileSider /> : siderCollapsed ? null : <Sider />}
        <main className={styles.main}>
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {siderCollapsed ? <CollapsedSider /> : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
      </div>
      <SettingsDialog />
      <Toast />
    </>
  )
}
