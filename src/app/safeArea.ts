/**
 * 横屏时刘海与导航条只报在某一侧，两侧取较大的那个共用，内容才会在玻璃的可见区域里居中。
 * 竖屏两条边都报 0，不做镜像。
 */
export const resolveSafeSide = (left: number, right: number, landscape: boolean): number =>
  landscape ? Math.max(left, right) : 0
