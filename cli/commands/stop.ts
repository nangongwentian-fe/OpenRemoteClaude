import { defineCommand } from 'citty'
import { stopProcess } from '../utils/process-manager'

export default defineCommand({
  meta: { name: 'stop', description: '停止 Remote Claude Code 服务' },
  async run() {
    const stopped = stopProcess()
    if (stopped) {
      console.log('[rcc] 服务已停止')
    } else {
      console.log('[rcc] 服务未在运行')
    }
  },
})
