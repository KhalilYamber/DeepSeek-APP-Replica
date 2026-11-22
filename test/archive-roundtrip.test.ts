import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeArchive } from '../src/services/chat/history/zipWriter.ts'
import { readArchive, readEntry } from '../src/services/chat/history/zipReader.ts'

/** 确定性伪随机字节，用来验证二进制条目没有被串改 */
const bytes = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 31 + 7) % 256)

const entriesOf = () => [
  {
    name: 'manifest.json',
    blob: new Blob([JSON.stringify({ export_format_version: 1 })], { type: 'application/json' }),
  },
  { name: 'chat_sessions/s1.json', blob: new Blob(['{"id":"s1","messages":[]}']) },
  { name: 'chat_sessions/s1_files/a.jpg', blob: new Blob([bytes(70_000)]) },
]

test('导出的 ZIP 能被自己的读取器原样读回（写入端与读取端必须成对）', async () => {
  const entries = entriesOf()
  const zip = await writeArchive(entries)
  const file = new File([zip], 'history.zip', { type: 'application/zip' })

  const seen: string[] = []
  for await (const entry of readArchive(file)) {
    seen.push(entry.path)
    const want = entries.find((item) => item.name === entry.path)
    assert.ok(want, `读到了导出端没写的条目：${entry.path}`)
    assert.equal(entry.size, want.blob.size)

    const got = await readEntry(entry)
    const gotBytes = Uint8Array.from(new Uint8Array(await got.arrayBuffer()))
    const wantBytes = Uint8Array.from(new Uint8Array(await want.blob.arrayBuffer()))
    assert.deepEqual(gotBytes, wantBytes, `条目内容不一致：${entry.path}`)
  }

  assert.deepEqual(seen.sort(), entries.map((item) => item.name).sort())
})

test('同一份归档重复导出，字节完全一致（时间戳被钉死，没有随机性）', async () => {
  const first = new Uint8Array(await (await writeArchive(entriesOf())).arrayBuffer())
  const second = new Uint8Array(await (await writeArchive(entriesOf())).arrayBuffer())
  assert.deepEqual(first, second)
})
