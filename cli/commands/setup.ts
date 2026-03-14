import { defineCommand } from 'citty'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export default defineCommand({
  meta: { name: 'setup', description: '初始化 Remote Claude Code（安装依赖 + 构建前端）' },
  async run() {
    const root = join(import.meta.dir, '../../')
    const distIndex = join(root, 'dist/client/index.html')

    if (existsSync(distIndex)) {
      console.log('[rcc] 前端已构建，跳过构建步骤')
    } else {
      console.log('[rcc] 安装依赖...')
      const installResult = Bun.spawnSync(['bun', 'install'], {
        cwd: root,
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'inherit',
      })
      if (installResult.exitCode !== 0) {
        console.error('[rcc] bun install 失败')
        process.exit(1)
      }

      console.log('[rcc] 构建前端...')
      const buildResult = Bun.spawnSync(['bun', 'run', 'build'], {
        cwd: root,
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'inherit',
      })
      if (buildResult.exitCode !== 0) {
        console.error('[rcc] 前端构建失败')
        process.exit(1)
      }

      console.log('[rcc] 构建完成')
    }

    console.log('\n运行 "rcc start" 启动服务')
  },
})
