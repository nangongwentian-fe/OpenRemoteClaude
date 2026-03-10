interface TailscaleInfo {
  ip: string | null;
  hostname: string | null;
  isAvailable: boolean;
  url: string | null;
}

let tailscaleInfo: TailscaleInfo = {
  ip: null,
  hostname: null,
  isAvailable: false,
  url: null,
};

const TAILSCALE_PATHS = [
  "tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
];

async function runTailscale(
  args: string[],
  timeoutMs = 5_000
): Promise<string | null> {
  for (const bin of TAILSCALE_PATHS) {
    try {
      const proc = Bun.spawn([bin, ...args], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const timer = setTimeout(() => proc.kill(), timeoutMs);
      const output = await new Response(proc.stdout).text();
      clearTimeout(timer);
      const code = await proc.exited;
      if (code === 0) return output.trim();
    } catch {
      // binary not found at this path, try next
    }
  }
  return null;
}

export async function detectTailscale(
  port: number
): Promise<TailscaleInfo> {
  // Try `tailscale status --json` first for rich info
  const json = await runTailscale(["status", "--json"]);
  if (json) {
    try {
      const status = JSON.parse(json);
      if (status.BackendState !== "Running") {
        return tailscaleInfo;
      }
      const self = status.Self;
      const ipv4 = self?.TailscaleIPs?.find(
        (ip: string) => ip.includes(".") && !ip.includes(":")
      );
      if (ipv4) {
        tailscaleInfo = {
          ip: ipv4,
          hostname: self?.HostName ?? null,
          isAvailable: true,
          url: `http://${ipv4}:${port}`,
        };
        return tailscaleInfo;
      }
    } catch {
      // JSON parse failed, fall through
    }
  }

  // Fallback: `tailscale ip -4`
  const ip = await runTailscale(["ip", "-4"]);
  if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    tailscaleInfo = {
      ip,
      hostname: null,
      isAvailable: true,
      url: `http://${ip}:${port}`,
    };
  }

  return tailscaleInfo;
}

export function getTailscaleInfo(): TailscaleInfo {
  return tailscaleInfo;
}
