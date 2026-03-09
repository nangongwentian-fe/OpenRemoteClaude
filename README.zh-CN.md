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
git clone https://github.com/anthropics/remote-claude-code.git
cd remote-claude-code
bun run setup  # 安装依赖 + 构建前端
```

### 运行

```bash
bun run start
```

服务器启动在 `http://localhost:3456`，并自动创建 Cloudflare Tunnel。控制台会显示隧道 URL — 在手机上打开即可开始使用。

首次访问时会提示设置密码。

### 开发

```bash
bun run dev          # 服务器（监听变更）+ Vite 开发服务器 同时启动
bun run dev:server   # 仅服务器
bun run dev:client   # 仅 Vite 开发服务器
bun run build        # 构建前端
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | `3456` |
| `RCC_JWT_SECRET` | JWT 签名密钥 | 自动生成并持久化到数据库 |
| `NO_TUNNEL` | 设为 `1` 禁用 Cloudflare Tunnel | — |

## 架构

```
server/
├── index.ts       # HTTP 入口，路由挂载，静态文件服务
├── ws.ts          # WebSocket 处理器 & 消息路由
├── claude.ts      # ClaudeSessionManager（封装 SDK query()）
├── auth.ts        # 密码设置/登录（bcrypt + JWT）
├── db.ts          # SQLite 数据存储（~/.remote-claude-code/data.db）
├── threads.ts     # 会话列表/历史 API
├── tunnel.ts      # Cloudflare Quick Tunnel
├── upload.ts      # 文件上传路由
└── projects.ts    # 项目管理路由

src/
├── App.tsx                # 根组件
├── pages/
│   ├── Chat.tsx           # 聊天主界面
│   └── Login.tsx          # 认证页面
├── components/
│   ├── MessageList.tsx    # 消息展示
│   ├── MessageBubble.tsx  # 单条消息
│   ├── InputBar.tsx       # 聊天输入框 + 附件
│   ├── ThreadSidebar.tsx  # 会话历史侧边栏
│   ├── ToolCallCard.tsx   # 工具调用可视化
│   ├── ThinkingBlock.tsx  # 思考过程展示
│   ├── MarkdownRenderer.tsx
│   └── ui/                # shadcn/ui 组件
├── hooks/                 # 状态管理
│   ├── useAuth.ts         # 认证 & JWT
│   ├── useWebSocket.ts    # 连接 & 自动重连
│   ├── useMessages.ts     # 流式消息组装
│   ├── useThreads.ts      # 会话列表 & 历史
│   └── useTheme.ts        # 主题管理
├── types/messages.ts      # WebSocket 消息类型
└── styles/globals.css     # Tailwind v4 主题
```

## WebSocket 协议

**客户端 → 服务器：** `auth`、`chat`、`interrupt`、`abort`、`ping`

**服务器 → 客户端：** `status`、`auth_result`、`chat_started`、`stream_delta`、`thinking_delta`、`thinking_start`、`thinking_end`、`tool_start`、`tool_input_delta`、`block_stop`、`assistant_message`、`system_init`、`result`、`chat_complete`、`error`

## 数据存储

所有持久化数据存储在 `~/.remote-claude-code/`：
- `data.db` — SQLite 数据库（配置、会话、消息）
- 聊天会话由 Claude Agent SDK 管理，位于 `~/.claude/projects/`

## 许可证

MIT
