import { defineCommand } from 'citty'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { readProcessInfo } from '../utils/process-manager'

async function tailFile(filePath: string, lines: number, follow: boolean) {
  if (!existsSync(filePath)) {
    console.log('[rcc] 日志文件不存在，服务可能尚未输出任何日志')
    return
  }

  const content = readFileSync(filePath, 'utf-8')
  const allLines = content.split('\n')
  const tail = allLines.slice(-lines).join('\n')
  process.stdout.write(tail + '\n')

  if (!follow) return

  let offset = Buffer.byteLength(content, 'utf-8')

  const { watch } = await import('node:fs')
  watch(filePath, () => {
    try {
      const buf = readFileSync(filePath)
      if (buf.byteLength < offset) {
        // 日志被轮转，文件从头开始
        offset = 0
      }
      if (buf.byteLength > offset) {
        process.stdout.write(buf.slice(offset).toString('utf-8'))
        offset = buf.byteLength
      }
    } catch {
      // ignore read errors (e.g. file temporarily unavailable)
    }
  })

  // 保持进程运行直到用户 Ctrl+C
  await new Promise<never>(() => {})
}

export default defineCommand({
  meta: { name: 'logs', description: '查看 Remote Claude Code 服务日志' },
  args: {
    lines: {
      type: 'string',
      description: '显示最后 N 行',
      default: '50',
    },
    follow: {
      type: 'boolean',
      description: '实时跟踪日志（类似 tail -f）',
      default: false,
      alias: 'f',
    },
  },
  async run({ args }) {
    const lines = parseInt(args.lines as string, 10)
    const follow = args.follow as boolean

    const info = readProcessInfo()
    const logFile = info?.logFile ?? join(homedir(), '.remote-claude-code', 'logs', 'rcc-out.log')

    await tailFile(logFile, lines, follow)
  },
})
