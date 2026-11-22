/**
 * 单条回复过长时的预览截断。
 *
 * 为什么需要：`content-visibility` 跳过的是屏幕外的**消息**，一条消息内部是整块渲染的。
 * 实测（本机无头 Chrome 157、390×844）单条 20 万字符的回复首帧要 3.5 秒，
 * 期间主线程被占死——滚动、点按全都没反应。这类「一条回复顶半个上下文」的会话，
 * 条数优化救不了，只能在渲染量上设一个上限。
 *
 * 截断点放在换行处，避免把一行切一半；如果截断后代码围栏是奇数个，
 * 补一个收尾围栏，否则预览会变成一大块没闭合的代码。
 */

/** 超过这么多字符才折叠（约 2 万汉字；20k 实测首帧 0.3s，再长开始明显卡） */
export const LONG_MESSAGE_CHARS = 30_000

/** 折叠时先渲染这么多字符 */
export const LONG_MESSAGE_PREVIEW_CHARS = 8_000

/** 数字加千分位：200000 → 200,000（自己实现，不跟着系统 locale 变） */
export const groupDigits = (value: number): string =>
  String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const previewMarkdown = (text: string, limit = LONG_MESSAGE_PREVIEW_CHARS): string => {
  if (text.length <= limit) {
    return text
  }
  let cut = text.lastIndexOf('\n', limit)
  // 前半个窗口里都没换行（一整段超长文本）就直接硬切
  if (cut < limit / 2) {
    cut = limit
  }
  let head = text.slice(0, cut)
  let fences = head.match(/```/g)?.length ?? 0
  if (fences % 2 === 1) {
    // 正好切在开围栏那一行（``` 或 ```ts）：整行丢掉，免得预览末尾挂一个空代码块
    const lines = head.split('\n')
    const last = lines.at(-1)?.trim() ?? ''
    if (/^```[\w+#-]*$/.test(last)) {
      lines.pop()
      head = lines.join('\n')
      fences -= 1
    }
    // 切在代码块内部：补一个收尾围栏，否则后面整段会被吃进代码块
    if (fences % 2 === 1) {
      head = `${head}\n\`\`\``
    }
  }
  return head
}
