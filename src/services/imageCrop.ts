export type CropInput = {
  naturalWidth: number
  naturalHeight: number
  /** 裁剪框在屏幕上的显示尺寸 */
  displayWidth: number
  displayHeight: number
  /** 用户缩放，1 表示刚好铺满裁剪框 */
  scale: number
  /** 图片相对裁剪框中心的位移（屏幕像素） */
  offsetX: number
  offsetY: number
}

export type CropRect = { x: number; y: number; width: number; height: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

/**
 * 把「裁剪框里看到的画面」换算成原图上的矩形，供 canvas.drawImage 使用。
 * 缩放以「铺满裁剪框」为 1，所以任何情况下裁剪矩形都不会超出原图；
 * 位移越界时夹回边界，不会画出空白边。
 */
export const computeCropRect = (input: CropInput): CropRect => {
  const { naturalWidth, naturalHeight, displayWidth, displayHeight } = input
  if (naturalWidth <= 0 || naturalHeight <= 0 || displayWidth <= 0 || displayHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const cover = Math.max(displayWidth / naturalWidth, displayHeight / naturalHeight)
  const effective = cover * Math.max(input.scale, 1)
  const width = displayWidth / effective
  const height = displayHeight / effective
  const centerX = naturalWidth / 2 - input.offsetX / effective
  const centerY = naturalHeight / 2 - input.offsetY / effective
  return {
    x: clamp(centerX - width / 2, 0, Math.max(0, naturalWidth - width)),
    y: clamp(centerY - height / 2, 0, Math.max(0, naturalHeight - height)),
    width,
    height,
  }
}
