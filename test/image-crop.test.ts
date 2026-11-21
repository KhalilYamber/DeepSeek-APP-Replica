import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCropRect } from '../src/services/imageCrop.ts'

const base = {
  naturalWidth: 2000,
  naturalHeight: 1000,
  displayWidth: 300,
  displayHeight: 300,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

test('横图、无位移：裁的是正中间那块正方形', () => {
  const rect = computeCropRect(base)
  assert.equal(rect.width, 1000)
  assert.equal(rect.height, 1000)
  assert.equal(rect.x, 500)
  assert.equal(rect.y, 0)
})

test('放大后裁剪矩形变小，中心不变', () => {
  const rect = computeCropRect({ ...base, scale: 2 })
  assert.equal(rect.width, 500)
  assert.equal(rect.height, 500)
  assert.equal(rect.x, 750)
  assert.equal(rect.y, 250)
})

test('位移越界时夹回边界，不会裁到图片外', () => {
  const rect = computeCropRect({ ...base, offsetX: 99999, offsetY: -99999 })
  assert.ok(rect.x >= 0)
  assert.ok(rect.y >= 0)
  assert.ok(rect.x + rect.width <= base.naturalWidth)
  assert.ok(rect.y + rect.height <= base.naturalHeight)
})

test('缩放小于 1 按 1 处理——图片至少要铺满裁剪框', () => {
  const rect = computeCropRect({ ...base, scale: 0.2 })
  assert.equal(rect.width, computeCropRect(base).width)
})

test('尺寸非法时返回空矩形，不抛错', () => {
  assert.deepEqual(computeCropRect({ ...base, naturalWidth: 0 }), {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
})

test('竖图：裁的是中间那条', () => {
  const rect = computeCropRect({
    ...base,
    naturalWidth: 1000,
    naturalHeight: 2000,
  })
  assert.equal(rect.width, 1000)
  assert.equal(rect.height, 1000)
  assert.equal(rect.x, 0)
  assert.equal(rect.y, 500)
})
