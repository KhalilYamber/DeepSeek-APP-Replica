/**
 * 「思考区当前是否展开」的判据。
 *
 * 三级回落，优先级从高到低：
 * 1. 用户手动点过这条消息 → 听用户的（切走再回来也保持）
 * 2. 正在流式 → 展开（不然看不到小窗口）
 * 3. 其它 → 按设置（思考结束后：收起思考 / 展开思考）
 *
 * 不需要「收尾边沿」：流式一结束，第二项自动失效，结果就落回设置值。
 * 所以组件里不再需要 touched / wasStreaming 两个 ref，也不需要那两个 effect。
 */

export type ThinkingEnd = 'collapse' | 'expand'

export type ThinkingOpenInput = {
  /** 用户对这条消息的手动选择；没点过就是 undefined */
  override: boolean | undefined
  streaming: boolean
  end: ThinkingEnd
}

export const resolveThinkingOpen = ({ override, streaming, end }: ThinkingOpenInput): boolean => {
  if (override !== undefined) {
    return override
  }
  if (streaming) {
    return true
  }
  return end === 'expand'
}
