// 跨平台构建脚本：官方 package.json 里的 `rm -rf dist && NODE_ENV=...` 是 Unix 语法，
// 在 Windows 的 cmd 下会直接失败。这里用 Node 重做同样的事。
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// 不能 require.resolve：@rspack/cli 的 exports 字段不允许访问内部路径。
const cli = join(root, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js')
if (!existsSync(cli)) {
  console.error(`找不到 rspack CLI：${cli}\n先运行 pnpm install。`)
  process.exit(1)
}

rmSync(join(root, 'dist'), { recursive: true, force: true })

const result = spawnSync(process.execPath, [cli, 'build', '-c', 'rspack.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
})

process.exit(result.status ?? 1)
