import './app/polyfills.js'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { logDiagnostic } from './services/diagnostics.js'
import { ensureKatex } from './services/markdown/katex.js'
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

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
