[中文](./README.zh-CN.md) | **English**

<p align="center">
  <img src="./public/images/logo.png" alt="Remote Claude Code" width="80%" />
</p>

# Remote Claude Code

Self-hosted tool to remotely control your local [Claude Code](https://docs.anthropic.com/en/docs/claude-code) from your phone — via Cloudflare Tunnel + PWA.

## Features

- **Remote Access** — Instantly expose your local Claude Code via Cloudflare Quick Tunnel, no configuration needed
- **PWA** — Install as a native-feeling app on your phone with offline support
- **Real-time Streaming** — WebSocket-based full-duplex communication with live text, thinking blocks, and tool call visualization
- **Multi-thread** — Create, switch, and resume multiple chat sessions, powered by Claude Agent SDK's session management
- **Tool Call Visualization** — See file edits, bash commands, and other tool uses as they happen
- **Thinking Blocks** — View Claude's reasoning process in real time
- **Light/Dark Theme** — Automatic or manual theme switching with Claude/Anthropic brand colors
- **Password Auth** — Secure access with bcrypt-hashed password + JWT tokens
- **File Attachments** — Upload files to provide context for your conversations
- **Project Switching** — Switch between different local project directories
- **Model Selection** — Choose from available Claude models
- **MCP Integration** — Works with configured MCP servers

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Hono](https://hono.dev) |
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| AI | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Tunnel | [cloudflared](https://www.npmjs.com/package/cloudflared) |
| Database | Bun built-in SQLite (WAL mode) |
| Auth | Bun.password (bcrypt) + Hono JWT |
| PWA | vite-plugin-pwa |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) configured on your machine

### Setup

```bash
git clone https://github.com/anthropics/remote-claude-code.git
cd remote-claude-code
bun run setup  # installs dependencies + builds frontend
```

### Run

```bash
bun run start
```

The server starts on `http://localhost:3456` and automatically creates a Cloudflare Tunnel. You'll see the tunnel URL in the console — open it on your phone to get started.

On first visit, you'll be prompted to set a password.

### Development

```bash
bun run dev          # server (watch) + Vite dev server concurrently
bun run dev:server   # server only
bun run dev:client   # Vite dev server only
bun run build        # build frontend
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3456` |
| `RCC_JWT_SECRET` | JWT signing key | Auto-generated and persisted in DB |
| `NO_TUNNEL` | Set to `1` to disable Cloudflare Tunnel | — |

## Architecture

```
server/
├── index.ts       # HTTP entry, routes, static files
├── ws.ts          # WebSocket handler & message routing
├── claude.ts      # ClaudeSessionManager (wraps SDK query())
├── auth.ts        # Password setup/login (bcrypt + JWT)
├── db.ts          # SQLite DataStore (~/.remote-claude-code/data.db)
├── threads.ts     # Thread listing/history API
├── tunnel.ts      # Cloudflare Quick Tunnel
├── upload.ts      # File upload routes
└── projects.ts    # Project management routes

src/
├── App.tsx                # Root component
├── pages/
│   ├── Chat.tsx           # Main chat UI
│   └── Login.tsx          # Auth page
├── components/
│   ├── MessageList.tsx    # Message display
│   ├── MessageBubble.tsx  # Individual messages
│   ├── InputBar.tsx       # Chat input + attachments
│   ├── ThreadSidebar.tsx  # Conversation history
│   ├── ToolCallCard.tsx   # Tool use visualization
│   ├── ThinkingBlock.tsx  # Thinking process display
│   ├── MarkdownRenderer.tsx
│   └── ui/                # shadcn/ui components
├── hooks/                 # State management
│   ├── useAuth.ts         # Auth & JWT
│   ├── useWebSocket.ts    # Connection & reconnect
│   ├── useMessages.ts     # Streaming message assembly
│   ├── useThreads.ts      # Thread list & history
│   └── useTheme.ts        # Theme management
├── types/messages.ts      # WebSocket message types
└── styles/globals.css     # Tailwind v4 theme
```

## WebSocket Protocol

**Client → Server:** `auth`, `chat`, `interrupt`, `abort`, `ping`

**Server → Client:** `status`, `auth_result`, `chat_started`, `stream_delta`, `thinking_delta`, `thinking_start`, `thinking_end`, `tool_start`, `tool_input_delta`, `block_stop`, `assistant_message`, `system_init`, `result`, `chat_complete`, `error`

## Data Storage

All persistent data is stored in `~/.remote-claude-code/`:
- `data.db` — SQLite database (config, sessions, messages)
- Chat sessions managed by Claude Agent SDK in `~/.claude/projects/`

## License

MIT
