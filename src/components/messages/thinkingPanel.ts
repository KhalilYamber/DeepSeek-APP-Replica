/**
 * 「思考区」展开/收起的判据。
 *
 * 抽成纯函数，是因为这里的组合最容易出岔子：流式中要展开、收尾要收起，
 * 但用户手动点过就不能再自动改；没有标题的工具步骤区根本不归它管。
 *
 * 两个边沿分别对应「续写」（false → true）与「本轮结束」（true → false）。
 *
 * 注意 `hasResponse` 在思考与正文交错时会在流式中来回翻（正文被顶进 steps 就变 null），
 * 所以调用方只能在**收尾那一刻**取它的值，不能订阅它自己的变化。
 */

export type ThinkingPanelState = {
  /** 这个会话当前是否在流式输出 */
  streaming: boolean
  /** 收尾那一刻是否已经有正文（或模板答复） */
  hasResponse: boolean
  /** 是否有可点的标题；没有标题的工具步骤区永远展开，不参与收起 */
  hasTitle: boolean
  /** 用户是否手动点过标题 */
  touched: boolean
}

/** 收尾边沿（streaming 由 true → false）：是否该收起 */
export const shouldCollapseThinking = (state: ThinkingPanelState): boolean =>
  !state.streaming && state.hasResponse && state.hasTitle && !state.touched

/** 开流边沿（streaming 由 false → true）：是否该展开——续写会复用同一个组件实例 */
export const shouldExpandThinking = (state: ThinkingPanelState): boolean =>
  state.streaming && !state.touched
