import './app/polyfills.js'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ErrorBoundary } from './components/base/ErrorBoundary.js'
import { logDiagnostic } from './services/diagnostics.js'
import { ensureKatex } from './services/markdown/katex.js'
import { initReadingFont } from './services/readingFont.js'
import { initChatBackground } from './services/chatBackground.js'
import './app/theme.css'
import './app/global.css'

// 未捕获的错误留在本机，供设置里的「诊断信息」一键复制出去
window.addEventListener('error', (event) => {
  logDiagnostic('error', event.message || `${event.filename}:${event.lineno}`)
})
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason
  const text = reason instanceof Error ? reason.message : String(reason)
  logDiagnostic('rejection', text)
})

ensureKatex()
setupTheme()
// 首屏渲染前把字号档位写进根元素，避免先按标准档画一帧再跳
initReadingFont()
initChatBackground()

// 最外层保险丝：整棵树渲染崩掉时，界面降级成一页能重试的说明，而不是全白
createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary scope="root">
    <App />
  </ErrorBoundary>
)
