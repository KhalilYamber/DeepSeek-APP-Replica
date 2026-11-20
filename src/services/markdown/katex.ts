export type Katex = typeof import('katex').default

/**
 * U+00B7（中点）在 KaTeX 的文本模式里会被映射成 `\cdotp` 命令，
 * 而该命令在文本模式不存在，整条公式会报错。换成 U+22C5（点运算符），
 * 数学与文本模式都认，视觉上几乎没差。
 */
const MIDDLE_DOT = /\u00B7/g
const DOT_OPERATOR = '\u22C5'

export const normalizeFormula = (input: string): string => input.replace(MIDDLE_DOT, DOT_OPERATOR)

let katex: Katex | null = null
let katexPromise: Promise<Katex> | null = null

/** 按需加载 KaTeX 及其样式、化学公式扩展；已加载时同步返回 */
export const ensureKatex = (): Katex | Promise<Katex> => {
  if (katex !== null) {
    return katex
  }
  katexPromise ??= Promise.all([
    import('katex'),
    import('katex/contrib/mhchem'),
    import('katex/dist/katex.min.css'),
  ]).then(([module]) => (katex = module.default))
  return katexPromise
}
