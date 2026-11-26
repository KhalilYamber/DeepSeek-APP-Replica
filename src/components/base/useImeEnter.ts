import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { createCompositionTracker, isImeSettling } from '../../utils/imeEnter.js'

/**
 * 把组字状态接到受控输入框上：焦点事件交给它记，按键处理先问它。
 *
 * ```
 * const ime = useImeEnter()
 * <input
 *   onCompositionStart={ime.onCompositionStart}
 *   onCompositionEnd={ime.onCompositionEnd}
 *   onKeyDown={(event) => {
 *     if (ime.claims(event)) return
 *     ...
 *   }}
 * />
 * ```
 */
export const useImeEnter = () => {
  const tracker = useMemo(() => createCompositionTracker(), [])
  return {
    onCompositionStart: () => tracker.start(),
    onCompositionEnd: () => tracker.end(),
    claims: (event: KeyboardEvent) =>
      isImeSettling({
        isComposing: event.nativeEvent.isComposing,
        keyCode: event.keyCode,
        composingRecently: tracker.isSettling(),
      }),
  }
}
