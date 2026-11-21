import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import { computeCropRect } from '../../services/imageCrop.js'
import styles from './ImageCropper.module.css'

/** 原图任一边超过这个就先缩小再进裁剪：手机 12MP 照片直接画进 canvas 在低端机会内存不足 */
const MAX_SOURCE = 4096

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    image.src = url
  })

/** 超过上限时等比缩到上限，返回新的图片对象；没超过就原样返回 */
const shrinkIfNeeded = async (image: HTMLImageElement): Promise<HTMLImageElement> => {
  const longest = Math.max(image.naturalWidth, image.naturalHeight)
  if (longest <= MAX_SOURCE) {
    return image
  }
  const ratio = MAX_SOURCE / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
  const context = canvas.getContext('2d')
  if (!context) {
    return image
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const shrunk = new Image()
  await new Promise<void>((resolve, reject) => {
    shrunk.onload = () => resolve()
    shrunk.onerror = () => reject(new Error('shrink failed'))
    shrunk.src = canvas.toDataURL('image/jpeg', 0.92)
  })
  return shrunk
}

/**
 * 通用裁剪器：拖动 + 滑块缩放，确认后按目标尺寸导出 JPEG。
 * aspect 为宽/高；1 时用圆形遮罩（头像），其余用矩形（背景图）。
 */
export const ImageCropper = ({
  file,
  aspect,
  outputWidth,
  quality,
  onConfirm,
  onCancel,
}: {
  file: File
  aspect: number
  outputWidth: number
  quality: number
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
}) => {
  const t = useTranslate()
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadImage(file)
      .then(shrinkIfNeeded)
      .then((next) => {
        if (!cancelled) {
          setImage(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    const el = stageRef.current
    if (!el || !image) {
      return
    }
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setStage({ width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [image])

  // 图片刚好铺满裁剪框时的基准缩放；用户的 scale 再乘上去
  const cover =
    image && stage.width > 0 && stage.height > 0
      ? Math.max(stage.width / image.naturalWidth, stage.height / image.naturalHeight)
      : 0

  /** 拖动与缩放都夹在这个范围内：图片边缘不能进到裁剪框里，否则会露出黑底 */
  const clampOffset = (nextX: number, nextY: number, nextScale: number) => {
    if (!image || cover <= 0) {
      return { x: nextX, y: nextY }
    }
    const limitX = Math.max(0, (image.naturalWidth * cover * nextScale - stage.width) / 2)
    const limitY = Math.max(0, (image.naturalHeight * cover * nextScale - stage.height) / 2)
    return {
      x: Math.min(Math.max(nextX, -limitX), limitX),
      y: Math.min(Math.max(nextY, -limitY), limitY),
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!image) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) {
      return
    }
    setOffset(
      clampOffset(
        start.ox + (event.clientX - start.x),
        start.oy + (event.clientY - start.y),
        scale
      )
    )
  }

  const endDrag = () => {
    drag.current = null
  }

  const confirm = () => {
    if (!image || busy) {
      return
    }
    setBusy(true)
    try {
      const rect = computeCropRect({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        displayWidth: stage.width,
        displayHeight: stage.height,
        scale,
        offsetX: offset.x,
        offsetY: offset.y,
      })
      if (rect.width <= 0 || rect.height <= 0) {
        throw new Error('empty crop')
      }
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = Math.max(1, Math.round(outputWidth / aspect))
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('canvas unavailable')
      }
      context.drawImage(
        image,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        canvas.width,
        canvas.height
      )
      onConfirm(canvas.toDataURL('image/jpeg', quality))
    } catch {
      showToast({ key: 'cropperFailed', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.mask} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        <div className={styles.title}>{t('cropperTitle')}</div>
        <div
          ref={stageRef}
          className={styles.stage}
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {image ? (
            <img
              className={styles.image}
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: image.naturalWidth * cover,
                height: image.naturalHeight * cover,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />
          ) : null}
          {aspect === 1 ? <div className={styles.circleFrame} /> : null}
        </div>
        <label className={styles.zoom}>
          <span>{t('cropperZoom')}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(event) => {
              const next = Number(event.target.value)
              setScale(next)
              // 缩小后允许的偏移变小，同步夹一下，否则图片会被甩出画面
              setOffset((current) => clampOffset(current.x, current.y, next))
            }}
          />
        </label>
        {failed ? <div className={styles.failed}>{t('cropperFailed')}</div> : null}
        <div className={styles.footer}>
          <Button size="m" variant="outlined" onClick={onCancel}>
            {t('cropperCancel')}
          </Button>
          <Button size="m" variant="primary" disabled={!image || busy} onClick={confirm}>
            {t('cropperSave')}
          </Button>
        </div>
      </div>
    </div>
  )
}
