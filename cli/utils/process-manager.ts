import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync, closeSync } from 'node:fs'
// node:child_process is used here (not Bun.spawn) because Bun.spawn lacks the
// 'detached' option needed to break out of Windows Job Objects so the child
// process survives after the parent CLI exits.
import { spawn } from 'node:child_process'

const RCC_DIR = join(homedir(), '.remote-claude-code')
const PID_FILE = join(RCC_DIR, 'rcc-process.json')

export interface ProcessInfo {
  pid: number
  port: number
  startTime: number
  logFile: string
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function readProcessInfo(): ProcessInfo | null {
  if (!existsSync(PID_FILE)) return null
  try {
    const info: ProcessInfo = JSON.parse(readFileSync(PID_FILE, 'utf-8'))
    if (!isProcessRunning(info.pid)) {
      try { unlinkSync(PID_FILE) } catch {}
      return null
    }
    return info
  } catch {
    return null
  }
}

export function startProcess(script: string, env: Record<string, string>): ProcessInfo {
  const logsDir = join(RCC_DIR, 'logs')
  mkdirSync(logsDir, { recursive: true })
  const logFile = join(logsDir, 'rcc-out.log')

  const logFd = openSync(logFile, 'a')
  const proc = spawn('bun', [script], {
    env: { ...process.env, ...env },
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
  })
  closeSync(logFd)
  proc.unref()

  const info: ProcessInfo = {
    pid: proc.pid!,
    port: parseInt(env.PORT ?? '3456', 10),
    startTime: Date.now(),
    logFile,
  }
  writeFileSync(PID_FILE, JSON.stringify(info, null, 2))
  return info
}

export function stopProcess(): boolean {
  const info = readProcessInfo()
  if (!info) return false
  try {
    process.kill(info.pid)
  } catch {
    // Process might already be dead
  }
  try { unlinkSync(PID_FILE) } catch {}
  return true
}
