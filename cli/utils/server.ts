const POLL_INTERVAL = 500
const POLL_TIMEOUT = 15_000

export async function waitForReady(port: number): Promise<boolean> {
  const url = `http://localhost:${port}/api/auth/status`
  const deadline = Date.now() + POLL_TIMEOUT

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 401) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }
  return false
}

interface NetworkInfo {
  tunnel: { url: string | null; isRunning: boolean }
  tailscale: { url: string | null; isAvailable: boolean }
  local: string
}

export async function fetchNetworkInfo(port: number): Promise<NetworkInfo> {
  const fallback: NetworkInfo = {
    tunnel: { url: null, isRunning: false },
    tailscale: { url: null, isAvailable: false },
    local: `http://localhost:${port}`,
  }

  try {
    const res = await fetch(`http://localhost:${port}/api/network`)
    if (!res.ok) return fallback
    const data = (await res.json()) as { tunnel: NetworkInfo['tunnel']; tailscale: NetworkInfo['tailscale'] }
    return {
      tunnel: data.tunnel ?? fallback.tunnel,
      tailscale: data.tailscale ?? fallback.tailscale,
      local: `http://localhost:${port}`,
    }
  } catch {
    return fallback
  }
}
