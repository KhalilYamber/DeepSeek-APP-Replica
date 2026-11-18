import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findInSession,
  flattenText,
  makeSnippet,
  messageText,
  searchAllSessions,
  sortHits,
} from '../src/services/chat/search.ts'
import type { AssistantMessage, Session, UserMessage } from '../src/services/chat/types.ts'

const userMessage = (id: string, content: string, createdAt = 1): UserMessage => ({
  id,
  role: 'user',
  content,
  files: [],
  createdAt,
})

const assistantMessage = (
  id: string,
  text: string,
  thinking = '',
  createdAt = 1
): AssistantMessage => ({
  id,
  role: 'assistant',
  createdAt,
  model: null,
  prefix: false,
  status: 'done',
  blocks: [
    ...(thinking ? [{ type: 'thinking' as const, thinking }] : []),
    { type: 'text' as const, text },
  ],
})

const session = (id: string, title: string, messages: Session['messages'], updatedAt = 1): Session => ({
  id,
  title,
  createdAt: 1,
  updatedAt,
  messages,
})

test('messageText 取用户正文与助手可见文本块，不含思考过程', () => {
  assert.equal(messageText(userMessage('u', '  帮我看看这个  ')), '  帮我看看这个  ')
  assert.equal(messageText(assistantMessage('a', '可见回答', '内部思考')), '可见回答')
  assert.ok(!messageText(assistantMessage('a', '可见回答', '内部思考')).includes('内部思考'))
})

test('flattenText 压掉换行与连续空白', () => {
  assert.equal(flattenText('第一行\n\n第二行   有空格\t结束'), '第一行 第二行 有空格 结束')
  assert.equal(flattenText('  '), '')
})

test('makeSnippet 命中时保留原文大小写，并在截断处补省略号', () => {
  const text = 'aaa '.repeat(20) + 'DeepSeek 的 API Key ' + 'bbb '.repeat(20)
  const snippet = makeSnippet(text, 'api key')
  assert.ok(snippet)
  assert.equal(snippet?.match, 'API Key')
  assert.ok(snippet?.before.startsWith('…'))
  assert.ok(snippet?.after.endsWith('…'))
})

test('makeSnippet 短文本不补省略号，不命中返回 null，空查询返回 null', () => {
  const snippet = makeSnippet('短文本里有头像功能', '头像')
  assert.deepEqual(snippet, { before: '短文本里有', match: '头像', after: '功能' })
  assert.equal(makeSnippet('短文本', '不存在'), null)
  assert.equal(makeSnippet('短文本', '   '), null)
})

test('makeSnippet 在压过空白之后才定位，跨换行的命中也能搜到', () => {
  const snippet = makeSnippet('对话\n历史搜索', '历史搜索')
  assert.ok(snippet)
  assert.equal(snippet?.match, '历史搜索')
})

test('findInSession 正文命中取最新一条，标题命中但正文没有时片段为 null', () => {
  const body = findInSession(
    session('s1', '无关标题', [
      userMessage('m1', '旧的问题里提到头像'),
      assistantMessage('m2', '新的回答里也提到头像'),
    ]),
    '头像'
  )
  assert.equal(body?.sessionId, 's1')
  assert.equal(body?.snippet?.before, '新的回答里也提到')

  const titleOnly = findInSession(session('s2', '头像怎么设', [userMessage('m1', '没有关键词')]), '头像')
  assert.equal(titleOnly?.snippet, null)

  assert.equal(findInSession(session('s3', '无关', [userMessage('m1', '无关')]), '头像'), null)
})

test('searchAllSessions 按最近更新排序并遵守 limit', () => {
  const sessions = [
    session('old', '旧', [userMessage('m1', '命中关键词')], 100),
    session('new', '新', [userMessage('m2', '命中关键词')], 300),
    session('mid', '中', [userMessage('m3', '命中关键词')], 200),
    session('miss', '没有', [userMessage('m4', '别的内容')], 400),
  ]
  assert.deepEqual(
    searchAllSessions(sessions, '命中关键词').map((hit) => hit.sessionId),
    ['new', 'mid', 'old']
  )
  assert.deepEqual(
    searchAllSessions(sessions, '命中关键词', 2).map((hit) => hit.sessionId),
    ['new', 'mid']
  )
  assert.deepEqual(searchAllSessions(sessions, '   '), [])
})

test('sortHits 不修改输入顺序之外的东西，且稳定按时间倒序', () => {
  const hits = sortHits(
    [
      { sessionId: 'a', title: '', at: 1, snippet: null },
      { sessionId: 'b', title: '', at: 3, snippet: null },
      { sessionId: 'c', title: '', at: 2, snippet: null },
    ],
    10
  )
  assert.deepEqual(
    hits.map((hit) => hit.sessionId),
    ['b', 'c', 'a']
  )
})
