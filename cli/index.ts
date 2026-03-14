#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import start from './commands/start'
import stop from './commands/stop'
import status from './commands/status'
import logs from './commands/logs'
import setup from './commands/setup'

const main = defineCommand({
  meta: {
    name: 'rcc',
    version: '0.1.0',
    description: 'Remote Claude Code CLI — 远程控制 Claude Code',
  },
  subcommands: { start, stop, status, logs, setup },
})

runMain(main)
