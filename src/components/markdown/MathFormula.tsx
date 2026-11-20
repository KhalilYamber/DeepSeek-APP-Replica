import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ensureKatex, normalizeFormula, type Katex } from '../../services/markdown/katex.js'
import { logDiagnostic } from '../../services/diagnostics.js'
import { useMathLoading } from './mathLoading.js'

/** renderToString 外层包裹的标签，组件自己渲染外层，这里切掉 */
const KATEX_WRAPPER = {
  inline: ['<span class="katex">', '</span>'],
  display: ['<span class="katex-display"><span class="katex">', '</span></span>'],
} as const

type MathHtmlResult = {
  html: string
  renderMode: 'katex' | 'tolerant' | 'fallback'
}

const noop = () => {}

/** 相同公式只记一条诊断，避免环形日志被同一个公式刷满 */
let lastReported = ''

const reportTolerant = (input: string) => {
  if (input === lastReported) {
    return
  }
  lastReported = input
  logDiagnostic('math', `公式含不支持的写法，已按可见错误渲染：${input.slice(0, 160)}`)
}

const stripWrapper = (html: string, isInline: boolean): string => {
  const [prefix, suffix] = KATEX_WRAPPER[isInline ? 'inline' : 'display']
  return html.slice(prefix.length, -suffix.length)
}

/** KaTeX 渲染公式；出错时保留上次成功的结果（流式中公式未写完），结束后退回可见错误 */
const useMathHtml = (input: string, isInline: boolean): MathHtmlResult => {
  const loading = useMathLoading()
  const previousResultRef = useRef<MathHtmlResult | null>(null)
  const katexRef = useRef(ensureKatex())
  const [katex, setKatex] = useState<Katex | null>(
    katexRef.current instanceof Promise ? null : katexRef.current
  )

  useEffect(() => {
    if (katexRef.current instanceof Promise) {
      katexRef.current.then(setKatex, noop)
    }
  }, [])

  return useMemo((): MathHtmlResult => {
    if (!katex) {
      return { html: input, renderMode: 'fallback' }
    }
    const source = normalizeFormula(input)
    try {
      const html = stripWrapper(
        katex.renderToString(source, {
          throwOnError: true,
          strict: false,
          displayMode: !isInline,
        }),
        isInline
      )
      const result = { html, renderMode: 'katex' } as const
      previousResultRef.current = result
      return result
    } catch {
      // 流式中：保留上一次成功的结果，避免公式未写完时来回闪
      if (loading) {
        return previousResultRef.current ?? { html: input, renderMode: 'fallback' }
      }
      // 流式结束仍失败：宽松模式，认识的部分照常渲染，只把不认识的标出来
      try {
        const html = stripWrapper(
          katex.renderToString(source, {
            throwOnError: false,
            strict: false,
            displayMode: !isInline,
            errorColor: '#cc0000',
          }),
          isInline
        )
        if (html.includes('katex-error')) {
          reportTolerant(input)
        }
        return { html, renderMode: 'tolerant' }
      } catch {
        return previousResultRef.current ?? { html: input, renderMode: 'fallback' }
      }
    }
  }, [input, isInline, katex, loading])
}

export const MathBlock = memo(function MathBlock({ value }: { value: string }) {
  const { html, renderMode } = useMathHtml(value, false)
  if (renderMode === 'fallback') {
    return <p className="ds-markdown-paragraph">{html}</p>
  }
  return (
    <span className="katex-display ds-markdown-math">
      <span className="katex" dangerouslySetInnerHTML={{ __html: html }}></span>
    </span>
  )
})

export const InlineMath = memo(function InlineMath({ value }: { value: string }) {
  const { html, renderMode } = useMathHtml(value, true)
  if (renderMode === 'fallback') {
    return html
  }
  return <span className="katex" dangerouslySetInnerHTML={{ __html: html }}></span>
})
