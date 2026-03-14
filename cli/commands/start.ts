import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readProcessInfo, startProcess } from '../utils/process-manager'
import { waitForReady, fetchNetworkInfo } from '../utils/server'

export default defineCommand({
  meta: { name: 'start', description: '启动 Remote Claude Code 服务' },
  args: {
    port: {
      type: 'string',
      description: '监听端口',
      default: '3456',
    },
    'no-tunnel': {
      type: 'boolean',
      description: '禁用 Cloudflare Tunnel',
      default: false,
    },
    'no-tailscale': {
      type: 'boolean',
      description: '禁用 Tailscale 检测',
      default: false,
    },
  },
  async run({ args }) {
    const port = parseInt(args.port as string, 10)
    const noTunnel = args['no-tunnel'] as boolean
    const noTailscale = args['no-tailscale'] as boolean

    const existing = readProcessInfo()
    if (existing) {
      console.log(`[rcc] 服务已在运行 (PID: ${existing.pid})`)
      console.log('[rcc] 使用 "rcc status" 查看详情，使用 "rcc stop" 停止服务')
      return
    }

    const serverPath = join(import.meta.dir, '../../server/index.ts')

    const env: Record<string, string> = { PORT: String(port) }
    if (noTunnel) env.NO_TUNNEL = '1'
    if (noTailscale) env.NO_TAILSCALE = '1'

    startProcess(serverPath, env)
    console.log('[rcc] 正在启动服务...')

    const ready = await waitForReady(port)
    if (!ready) {
      console.error('[rcc] 等待服务就绪超时（15s），请运行 "rcc logs" 查看日志')
      process.exit(1)
    }

    const network = await fetchNetworkInfo(port)
    const width = 42
    console.log(`\n${'='.repeat(width)}`)
    console.log('  Remote Claude Code')
    console.log(`${'-'.repeat(width)}`)
    console.log(`  Local:      ${network.local}`)
    if (network.tailscale.isAvailable && network.tailscale.url) {
      console.log(`  Tailscale:  ${network.tailscale.url}`)
    }
    if (network.tunnel.isRunning && network.tunnel.url) {
      console.log(`  Tunnel:     ${network.tunnel.url}`)
    }
    console.log(`${'-'.repeat(width)}`)
    console.log('  Open any URL above on your phone!')
    console.log(`${'='.repeat(width)}\n`)
  },
})
