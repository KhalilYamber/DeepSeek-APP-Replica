/**
 * 识别「整段就是一个裸 LaTeX 片段」的文本。
 *
 * 为什么只认整段、不认行内：行内识别会把「讲解 LaTeX 用法」的正常句子渲染掉
 * （例如「你可以用 \textcolor{red}{文字} 来上色」），用户就看不到命令本身了。
 * 整段匹配只在消息本身就是一段 LaTeX 时生效，误伤面小得多。
 */

/** 认得的命令：文本排版类 + LLM 常用的数学命令 */
const COMMANDS = new Set([
  'text',
  'texttt',
  'textbf',
  'textit',
  'textsf',
  'textrm',
  'textnormal',
  'emph',
  'tiny',
  'scriptsize',
  'footnotesize',
  'small',
  'normalsize',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
  'textcolor',
  'color',
  'colorbox',
  'fcolorbox',
  'frac',
  'dfrac',
  'tfrac',
  'sqrt',
  'ce',
  'pu',
  'mathrm',
  'mathbf',
  'mathit',
  'mathbb',
  'mathcal',
  'mathfrak',
  'mathsf',
  'mathtt',
  'operatorname',
  'boxed',
  'underbrace',
  'overbrace',
  'binom',
  'overset',
  'underset',
  'stackrel',
  'cancel',
  'phantom',
  'hspace',
  'displaystyle',
  'textstyle',
])

const LETTER = /[A-Za-z]/

const isLetter = (ch: string | undefined): boolean => ch !== undefined && LETTER.test(ch)

/**
 * 从 start 起扫一个括号配平的片段，返回片段末尾（不含）。
 * 只有整段都被这个片段吃下才算数，所以调用方用返回值与文本长度比较。
 */
function scanToEnd(text: string): number | null {
  if (text[0] !== '\\' || !isLetter(text[1])) {
    return null
  }
  let i = 1
  while (isLetter(text[i])) {
    i++
  }
  if (!COMMANDS.has(text.slice(1, i))) {
    return null
  }
  let depth = 0
  let hasBrace = false
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      let j = i + 1
      if (isLetter(text[j])) {
        while (isLetter(text[j])) {
          j++
        }
      } else {
        j++
      }
      i = j
      continue
    }
    if (ch === '{') {
      depth++
      hasBrace = true
      i++
      continue
    }
    if (ch === '}') {
      depth--
      i++
      if (depth < 0) {
        return null
      }
      continue
    }
    if (depth > 0) {
      i++
      continue
    }
    return null
  }
  return depth === 0 && hasBrace ? i : null
}

/** 整段（去首尾空白、单行）恰好是一个片段时返回它，否则返回 null */
export function matchBareTexParagraph(value: string): string | null {
  const text = value.trim()
  if (!text || text.includes('\n')) {
    return null
  }
  return scanToEnd(text) === text.length ? text : null
}
