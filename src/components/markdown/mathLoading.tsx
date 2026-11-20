import { createContext, useContext } from 'react'

/**
 * 当前 Markdown 是否还在流式输出中。
 * 公式用它决定失败策略：流式中保留上一次成功的结果（避免每个 token 闪一下），
 * 结束后才允许用宽松模式把错误命令标出来。
 */
const MathLoadingContext = createContext(true)

export const MathLoadingProvider = MathLoadingContext.Provider

export const useMathLoading = (): boolean => useContext(MathLoadingContext)
