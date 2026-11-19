import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  shouldCollapseThinking,
  shouldExpandThinking,
  type ThinkingPanelState,
} from '../src/components/messages/thinkingPanel.ts'

const base: ThinkingPanelState = {
  streaming: false,
  hasResponse: true,
  hasTitle: true,
  touched: false,
}

test('收尾：有正文、有标题、没被点过 → 收起', () => {
  assert.equal(shouldCollapseThinking(base), true)
})

test('收尾：用户点过标题 → 不收起（尊重手动意图）', () => {
  assert.equal(shouldCollapseThinking({ ...base, touched: true }), false)
})

test('收尾：没有正文（用户停止 / 出错 / 只有思考）→ 不收起', () => {
  assert.equal(shouldCollapseThinking({ ...base, hasResponse: false }), false)
})

test('收尾：没有标题（纯工具步骤区）→ 不收起，否则工具行会被藏掉', () => {
  assert.equal(shouldCollapseThinking({ ...base, hasTitle: false }), false)
})

test('收尾：还在流式中 → 不收起', () => {
  assert.equal(shouldCollapseThinking({ ...base, streaming: true }), false)
})

test('开流：续写把新思考塞进同一个实例 → 展开', () => {
  assert.equal(shouldExpandThinking({ ...base, streaming: true }), true)
})

test('开流：用户点过标题 → 不自动展开', () => {
  assert.equal(shouldExpandThinking({ ...base, streaming: true, touched: true }), false)
})

test('开流：没有标题也返回 true —— 无害，因为那时根本不渲染标题行', () => {
  assert.equal(shouldExpandThinking({ ...base, streaming: true, hasTitle: false }), true)
})
