import { useEffect, useRef, useState } from 'react'
import { getLastClamp } from '../../app/viewport.js'

/** 「键盘弹着，但焦点那个输入框没落在可见区域里」——就是作者说的「输入框被往上顶」那一刻 */
const isInputOutOfView = () => {
  const field = document.activeElement as HTMLElement | null
  const vv = window.visualViewport
  if (!field || !vv) {
    return false
  }
  if (field.tagName !== 'TEXTAREA' && field.tagName !== 'INPUT') {
    return false
  }
  // 键盘没弹就别报：那时输入框在页面底部是正常的
  if (window.innerHeight - vv.height <= 120) {
    return false
  }
  const rect = field.getBoundingClientRect()
  const visibleTop = vv.offsetTop
  const visibleBottom = visibleTop + vv.height
  return rect.bottom > visibleBottom + 8 || rect.top < visibleTop - 8
}

const readLines = () => {
  const vv = window.visualViewport
  const frame = document.querySelector('[data-app-frame]') as HTMLElement | null
  const field = document.activeElement as HTMLElement | null
  const rect =
    field && (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT')
      ? field.getBoundingClientRect()
      : null
  const clamp = getLastClamp()
  const style = frame ? getComputedStyle(frame) : null
  return [
    `inner=${window.innerHeight} vv=${vv ? Math.round(vv.height) : '无'} offTop=${vv ? Math.round(vv.offsetTop) : '无'} scale=${vv ? vv.scale.toFixed(2) : '无'}`,
    `frame height=${frame ? frame.style.height || '（无内联）' : '未找到'} top=${style?.top ?? '?'} pos=${style?.position ?? '?'}`,
    `clamp=${clamp ? `${clamp.decision.mode} ${clamp.decision.height ?? ''}${clamp.decision.top !== undefined ? '/' + clamp.decision.top : ''}` : '还没跑过'}`,
    `focus=${field?.tagName ?? 'none'}${rect ? ` 输入框 top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)}` : ''}`,
  ]
}

/**
 * 视口自诊浮层。两个入口：
 * 1. 地址里带 `#kbdiag`（方便在电脑或链接里手动打开）；
 * 2. **自动**——检测到「键盘弹着、但焦点输入框不在可见区域内」时自己弹出来并冻结当时的读数。
 *
 * 为什么要有第二条：微信里改地址等于重新打开页面，一刷新现场就没了；这个毛病又是偶发的，
 * 只能让它在出事的那一刻自己把数字记下来。
 */
export const ViewportOverlay = () => {
  const [open, setOpen] = useState(() => window.location.hash === '#kbdiag')
  const [lines, setLines] = useState<string[]>([])
  const [snapshots, setSnapshots] = useState<string[]>([])
  const frozen = useRef(false)
  const strikes = useRef(0)

  useEffect(() => {
    const onHash = () => setOpen(window.location.hash === '#kbdiag')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const tick = () => {
      if (isInputOutOfView()) {
        // 连中两次才算：键盘动画中间那一两帧也可能短暂越界
        strikes.current += 1
        if (strikes.current >= 2 && !frozen.current) {
          frozen.current = true
          setSnapshots((prev) => [...prev.slice(-4), readLines().join('\n')])
          setOpen(true)
        }
        return
      }
      strikes.current = 0
      frozen.current = false
      if (open) {
        setLines(readLines())
      }
    }
    const timer = window.setInterval(tick, 500)
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

  const buttonStyle = {
    font: 'inherit',
    padding: '4px 9px',
    borderRadius: 6,
    border: '1px solid #666',
    background: '#333',
    color: '#fff',
  } as const

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
        background: 'rgba(20, 22, 26, 0.9)',
        color: '#fff',
        font: '11px/1.5 ui-monospace, Menlo, Consolas, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>视口读数</div>
      <div>{lines.join('\n')}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          type="button"
          onClick={() => setSnapshots((prev) => [...prev.slice(-4), readLines().join('\n')])}
          style={buttonStyle}
        >
          记一笔
        </button>
        <button
          type="button"
          onClick={() => copy([lines.join('\n'), ...snapshots].join('\n---\n'))}
          style={buttonStyle}
        >
          复制
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.hash = ''
            frozen.current = false
            setOpen(false)
          }}
          style={buttonStyle}
        >
          关掉
        </button>
      </div>
      {snapshots.length > 0 ? (
        <div style={{ marginTop: 6, borderTop: '1px solid #444', paddingTop: 4 }}>
          出问题那一刻的读数：
          {'\n'}
          {snapshots.join('\n---\n')}
        </div>
      ) : null}
    </div>
  )
}
