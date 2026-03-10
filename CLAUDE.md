# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Remote Claude Code — a self-hosted tool to remotely control Claude Code from your phone via Cloudflare Tunnel / Tailscale + PWA. Bun runtime, Hono backend, React 19 frontend.

## Commands

```bash
# Development (runs server + Vite dev concurrently)
bun run dev

# Server only (watches for changes)
bun run dev:server

# Client only (Vite dev server)
bun run dev:client

# Build frontend
bun run build

# Production start (serves built client + API)
bun run start

# First-time setup
bun run setup   # = bun install && bunx vite build
```

No test framework or linter is configured.

## Architecture

**Backend** (`server/`): Hono app on port 3456 (configurable via `PORT` env).

- `index.ts` — HTTP server entry, mounts routes, serves static files in production
- `ws.ts` — WebSocket handler: auth handshake, message routing between clients and Claude SDK
- `claude.ts` — `ClaudeSessionManager` wraps `@anthropic-ai/claude-agent-sdk`'s `query()` for streaming responses, supports session resume via `resumeSessionId`
- `auth.ts` — Password setup/login with `Bun.password` (bcrypt) + JWT (Hono/jwt, 72h expiry)
- `db.ts` — `DataStore` class wrapping Bun's built-in SQLite (`~/.remote-claude-code/data.db`), WAL mode. Tables: `config`, `sessions`, `messages`
- `threads.ts` — Thread listing/history API routes
- `tunnel.ts` — Cloudflare Quick Tunnel via `cloudflared` npm package
- `tailscale.ts` — Tailscale IP detection (auto-detects Tailscale availability and IP)

**Frontend** (`src/`): React 19 SPA built with Vite.

- `App.tsx` — Root component, orchestrates auth flow and renders Login or Chat
- `pages/` — `Login.tsx` (password setup/login), `Chat.tsx` (main chat UI)
- `hooks/` — Core state logic:
  - `useAuth` — auth status check, password setup, JWT management (stored in `localStorage` as `rcc_token`)
  - `useTheme` — light/dark/system theme management, localStorage persistence, matchMedia listener
  - `useWebSocket` — connection lifecycle, auto-reconnect with exponential backoff, heartbeat (30s), message dispatch
  - `useMessages` — streaming message assembly (text deltas, thinking blocks, tool calls)
  - `useThreads` — thread list and message history loading
- `components/` — `MessageList`, `MessageBubble`, `InputBar`, `ThreadSidebar`, `ToolCallCard`, `ThinkingBlock`
- `components/ui/` — shadcn/ui components (manually created, not via CLI)
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `types/messages.ts` — TypeScript union types for all WebSocket message payloads

## WebSocket Protocol

Client-to-server: `auth`, `chat`, `interrupt`, `abort`, `ping`
Server-to-client: `status`, `auth_result`, `chat_started`, `stream_delta`, `thinking_delta`, `thinking_start/end`, `tool_start`, `tool_input_delta`, `block_stop`, `assistant_message`, `system_init`, `result`, `chat_complete`, `error`

Auth flow: connect → server sends `needsAuth: true` → client sends JWT via `auth` message → server verifies → `auth_result`

## Key Conventions

- **Runtime**: Always use Bun (not Node). `Bun.password`, `Bun.serve`, built-in SQLite
- **Tailwind v4**: Uses `@import "tailwindcss"` + `@theme inline` syntax (not `@tailwind` directives). Theme defined in `src/styles/globals.css`
- **Theme**: Claude/Anthropic brand colors. Light/dark dual theme with `useTheme` hook. Primary accent: terra cotta `#d97757`. Light bg: `#faf9f5`, dark bg: `#1a1915`. CSS variables in `globals.css`, `.dark` class on `<html>` for dark mode. Theme preference stored in localStorage as `rcc_theme`
- **Overlay pattern**: Use `--color-overlay`, `--color-overlay-hover`, `--color-overlay-border` CSS variables instead of hardcoded `white/X` or `black/X` opacity patterns
- **shadcn/ui**: Components manually created in `src/components/ui/`. Do not use shadcn CLI
- **Icons**: lucide-react only. No emoji as icons
- **PWA safe areas**: Use `env(safe-area-inset-top/bottom)` for mobile viewport padding
- **Path alias**: `@/` maps to `src/` (configured in both tsconfig and Vite)
- **Claude SDK**: `permissionMode: "acceptEdits"`, max 50 turns, includes partial messages. Allowed tools are explicitly listed in `claude.ts`

## Environment Variables

- `PORT` — Server port (default: 3456)
- `RCC_JWT_SECRET` — JWT signing key (default: random UUID per restart)
- `NO_TUNNEL=1` — Disable Cloudflare Tunnel
- `NO_TAILSCALE=1` — Disable Tailscale IP detection
