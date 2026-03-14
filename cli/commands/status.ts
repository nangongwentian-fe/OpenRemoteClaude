import { defineCommand } from 'citty'
import { readProcessInfo } from '../utils/process-manager'
import { fetchNetworkInfo } from '../utils/server'

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default defineCommand({
  meta: { name: 'status', description: '查看 Remote Claude Code 服务状态' },
  async run() {
    const info = readProcessInfo()

    if (!info) {
      console.log('[rcc] 服务未在运行')
      console.log('      运行 "rcc start" 启动服务')
      return
    }

    console.log('[rcc] 服务运行中')
    console.log(`  PID:     ${info.pid}`)
    console.log(`  运行时长: ${formatUptime(Date.now() - info.startTime)}`)
    console.log(`  日志:    ${info.logFile}`)

    const network = await fetchNetworkInfo(info.port)
    console.log(`\n  Local:      ${network.local}`)
    if (network.tailscale.isAvailable && network.tailscale.url) {
      console.log(`  Tailscale:  ${network.tailscale.url}`)
    }
    if (network.tunnel.isRunning && network.tunnel.url) {
      console.log(`  Tunnel:     ${network.tunnel.url}`)
    }
  },
})
