import { useEffect, useState } from 'react'
import { getLastClamp } from '../../app/viewport.js'

/**
 * `#kbdiag` 浮层：只在地址里带 `#kbdiag` 时出现，给真机读数用。
 *
 * 为什么要有它：iPad 上偶发的「叫出键盘后输入框被顶上去、下面空一大块」靠猜定位过两轮，
 * 都猜错了。这一层把布局视口、视觉视口、这帧的实际定位、输入框的实际位置同时摆出来，
 * 卡住那一刻截一张图就能定性。
 *
 * 用 `#kbdiag` 而不是开关：不落任何持久设置，删掉 hash 就消失。
 */
export const ViewportOverlay = () => {
  const [open, setOpen] = useState(() => window.location.hash === '#kbdiag')
  const [lines, setLines] = useState<string[]>([])
  const [snapshots, setSnapshots] = useState<string[]>([])

  useEffect(() => {
    const onHash = () => setOpen(window.location.hash === '#kbdiag')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const read = () => {
      const vv = window.visualViewport
      const frame = document.querySelector('[data-app-frame]')
      const field = document.activeElement as HTMLElement | null
      const rect = field?.tagName === 'TEXTAREA' || field?.tagName === 'INPUT' ? field.getBoundingClientRect() : null
      const clamp = getLastClamp()
      const style = frame ? getComputedStyle(frame) : null
      return [
        `inner=${window.innerHeight} vv=${vv ? Math.round(vv.height) : '无'} offTop=${vv ? Math.round(vv.offsetTop) : '无'} scale=${vv ? vv.scale.toFixed(2) : '无'}`,
        `frame height=${frame ? (frame as HTMLElement).style.height || '（无内联）' : '未找到'} top=${style?.top ?? '?'} pos=${style?.position ?? '?'}`,
        `clamp=${clamp ? `${clamp.decision.mode} ${clamp.decision.height ?? ''}${clamp.decision.top !== undefined ? '/' + clamp.decision.top : ''}` : '还没跑过'}`,
        `focus=${field?.tagName ?? 'none'}${rect ? ` 输入框 top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)}` : ''}`,
        `hash=${window.location.hash || '（无）'} 时间=${new Date().toLocaleTimeString()}`,
      ]
    }
    setLines(read())
    const timer = window.setInterval(() => setLines(read()), 500)
    return () => window.clearInterval(timer)
  }, [open])

  if (!open) {
    return null
  }

  const copy = (text: string) => {
    try {
      const temp = document.createElement('textarea')
      temp.value = text
      temp.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0'
      document.body.appendChild(temp)
      temp.select()
      document.execCommand('copy')
      document.body.removeChild(temp)
    } catch {
      // 复制失败不影响读数，用户还能截图
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 2147483000,
        width: 'min(340px, calc(100vw - 16px))',
        padding: '8px 10px',
        borderRadius: 10,
        background: 'rgba(20, 22, 26, 0.86)',
        color: '#fff',
        font: '11px/1.5 ui-monospace, Menlo, Consolas, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>视口读数（#kbdiag）</div>
      <div>{lines.join('\n')}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          type="button"
          onClick={() => setSnapshots((prev) => [...prev.slice(-4), lines.join('\n')])}
          style={{ font: 'inherit', padding: '3px 8px', borderRadius: 6, border: '1px solid #666', background: '#333', color: '#fff' }}
        >
          记一笔
        </button>
        <button
          type="button"
          onClick={() => copy([lines.join('\n'), ...snapshots].join('\n---\n'))}
          style={{ font: 'inherit', padding: '3px 8px', borderRadius: 6, border: '1px solid #666', background: '#333', color: '#fff' }}
        >
          复制
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.hash = ''
            setOpen(false)
          }}
          style={{ font: 'inherit', padding: '3px 8px', borderRadius: 6, border: '1px solid #666', background: '#333', color: '#fff' }}
        >
          关掉
        </button>
      </div>
      {snapshots.length > 0 ? (
        <div style={{ marginTop: 6, borderTop: '1px solid #444', paddingTop: 4 }}>{snapshots.join('\n---\n')}</div>
      ) : null}
    </div>
  )
}
