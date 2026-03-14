**中文** | [English](./README.md)

<p align="center">
  <img src="./public/images/logo.png" alt="Remote Claude Code" width="80%" />
</p>

# Remote Claude Code

自托管工具，通过 Cloudflare Tunnel + PWA 从手机远程操控本机 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)。

## 功能特性

- **远程访问** — 通过 Cloudflare Quick Tunnel 即时暴露本地 Claude Code，无需额外配置
- **PWA** — 可安装为手机原生应用体验，支持离线访问
- **实时流式输出** — 基于 WebSocket 的全双工通信，实时展示文本、思考过程和工具调用
- **多会话** — 创建、切换和恢复多个聊天会话，基于 Claude Agent SDK 的会话管理
- **工具调用可视化** — 实时查看文件编辑、Bash 命令等工具调用过程
- **思考过程** — 实时查看 Claude 的推理过程
- **亮/暗主题** — 自动或手动切换主题，采用 Claude/Anthropic 品牌配色
- **密码认证** — bcrypt 哈希密码 + JWT 令牌的安全访问
- **文件附件** — 上传文件为对话提供上下文
- **项目切换** — 在不同本地项目目录间切换
- **模型选择** — 选择可用的 Claude 模型
- **MCP 集成** — 支持已配置的 MCP 服务器
- **内置终端** — 交互式终端面板，支持 Windows（管道模式）和 POSIX PTY

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| 后端 | [Hono](https://hono.dev) |
| 前端 | React 19 + Vite |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| AI | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| 隧道 | [cloudflared](https://www.npmjs.com/package/cloudflared) |
| 数据库 | Bun 内置 SQLite (WAL 模式) |
| 认证 | Bun.password (bcrypt) + Hono JWT |
| PWA | vite-plugin-pwa |

## 快速开始

### 前置要求

- [Bun](https://bun.sh) v1.0+
- 本机已配置 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

### 安装

```bash
# 使用 npm
npm install -g remote-claude-code

# 或使用 bun
bun add -g remote-claude-code
```

### 启动

```bash
rcc start
```

就这些。服务启动在 `http://localhost:3456`，并自动创建 Cloudflare Tunnel。
终端会打印所有可用访问地址，在手机上打开任意一个即可开始使用。

首次访问时会提示设置密码。

## CLI 命令参考

```
rcc start                        在后台启动服务
      --port <n>                   监听指定端口（默认：3456）
      --no-tunnel                  禁用 Cloudflare Tunnel
      --no-tailscale               禁用 Tailscale 检测
rcc stop                         停止服务
rcc status                       查看 PID、运行时长和访问地址
rcc logs                         查看服务日志
      -f, --follow                 实时跟踪新日志（类似 tail -f）
      --lines <n>                  显示最后 N 行（默认：50）
rcc setup                        重新构建前端（仅在更新源码后需要）
```

## 开发

### 从源码克隆并运行

```bash
git clone https://github.com/anthropics/remote-claude-code.git
cd remote-claude-code
bun install
bun link       # 从当前目录全局注册 rcc 命令
rcc setup      # 构建前端（仅首次）
rcc start
```

### 开发服务器

```bash
bun run dev          # 服务器（监听变更）+ Vite 开发服务器 同时启动
bun run dev:server   # 仅服务器
bun run dev:client   # 仅 Vite 开发服务器
bun run build        # 构建前端
```

### Windows 终端排查

- Windows 下终端会话使用管道模式（`stdin/stdout`），因为 Bun PTY 仅支持 POSIX。
- 若「创建终端」失败，请确认配置的 Shell 存在且可执行，然后重启服务。
- Windows 默认 Shell 探测顺序：`pwsh.exe` → `powershell.exe` → `cmd.exe`。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | `3456` |
| `RCC_JWT_SECRET` | JWT 签名密钥 | 自动生成并持久化到数据库 |
| `NO_TUNNEL` | 设为 `1` 禁用 Cloudflare Tunnel | — |
| `NO_TAILSCALE` | 设为 `1` 禁用 Tailscale 检测 | — |

## 架构

```
cli/
├── index.ts              # CLI 入口（rcc 命令）
├── constants.ts          # 共享常量（APP_NAME）
├── commands/
│   ├── start.ts          # rcc start — 后台启动服务进程
│   ├── stop.ts           # rcc stop  — 通过 PID 终止服务
│   ├── status.ts         # rcc status
│   ├── logs.ts           # rcc logs
│   └── setup.ts          # rcc setup
└── utils/
    ├── process-manager.ts # 基于 PID 文件的跨平台进程管理
    └── server.ts          # 健康检查 & 网络信息工具

server/
├── index.ts       # HTTP 入口，路由挂载，静态文件服务
├── ws.ts          # WebSocket 处理器 & 消息路由
├── claude.ts      # ClaudeSessionManager（封装 SDK query()）
├── auth.ts        # 密码设置/登录（bcrypt + JWT）
├── db.ts          # SQLite 数据存储（~/.remote-claude-code/data.db）
├── threads.ts     # 会话列表/历史 API
├── tunnel.ts      # Cloudflare Quick Tunnel
├── tailscale.ts   # Tailscale IP 检测
├── upload.ts      # 文件上传路由
└── projects.ts    # 项目管理路由

src/
├── App.tsx
├── pages/
│   ├── Chat.tsx           # 聊天主界面
│   └── Login.tsx          # 认证页面
├── components/
│   ├── MessageList.tsx
│   ├── MessageBubble.tsx
│   ├── InputBar.tsx       # 聊天输入框 + 附件
│   ├── ThreadSidebar.tsx
│   ├── ToolCallCard.tsx
│   ├── ThinkingBlock.tsx
│   ├── MarkdownRenderer.tsx
│   └── ui/                # shadcn/ui 组件
├── hooks/
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   ├── useMessages.ts
│   ├── useThreads.ts
│   └── useTheme.ts
├── types/messages.ts
└── styles/globals.css
```

## WebSocket 协议

**客户端 → 服务器：** `auth`、`chat`、`interrupt`、`abort`、`ping`

**服务器 → 客户端：** `status`、`auth_result`、`chat_started`、`stream_delta`、`thinking_delta`、`thinking_start`、`thinking_end`、`tool_start`、`tool_input_delta`、`block_stop`、`assistant_message`、`system_init`、`result`、`chat_complete`、`error`

## 数据存储

所有持久化数据存储在 `~/.remote-claude-code/`：

| 路径 | 内容 |
|------|------|
| `data.db` | SQLite 数据库——配置、会话、消息 |
| `rcc-process.json` | 运行中的服务 PID 及元数据 |
| `logs/rcc-out.log` | 服务输出日志（通过 `rcc logs` 查看）|

聊天会话由 Claude Agent SDK 管理，位于 `~/.claude/projects/`。

## 许可证

MIT
