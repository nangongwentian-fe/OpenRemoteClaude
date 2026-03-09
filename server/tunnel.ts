import { tunnel as startTunnel } from "cloudflared";

interface TunnelInfo {
  url: string | null;
  isRunning: boolean;
  protocol: "quic" | "http2" | null;
}

let tunnelInfo: TunnelInfo = { url: null, isRunning: false, protocol: null };
let stopFn: (() => void) | null = null;

const QUIC_FAIL_SIGNAL = "failed to dial to edge with quic";
const REGISTERED_SIGNAL = "Registered tunnel connection";

export async function launchTunnel(port: number): Promise<string> {
  const forced = process.env.RCC_TUNNEL_PROTOCOL as
    | "quic"
    | "http2"
    | undefined;

  if (forced) {
    console.log(`[Tunnel] Protocol forced to ${forced} via env`);
    return startWithProtocol(port, forced);
  }

  try {
    return await startWithProtocol(port, "quic");
  } catch {
    console.log("[Tunnel] QUIC failed, falling back to HTTP/2...");
    return startWithProtocol(port, "http2");
  }
}

function startWithProtocol(
  port: number,
  protocol: "quic" | "http2"
): Promise<string> {
  console.log(`[Tunnel] Starting Cloudflare Tunnel (${protocol})...`);

  const { url, child, stop } = startTunnel({
    "--url": `localhost:${port}`,
    "--protocol": protocol,
  });

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tunnelUrl: string | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      child.stderr?.removeListener("data", onStderr);
      child.removeListener("exit", onExit);
    };

    const settle = (url: string | null, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (url) {
        console.log(`[Tunnel] Connected via ${protocol}: ${url}`);
        tunnelInfo = { url, isRunning: true, protocol };
        stopFn = stop;
        child.on("exit", (code: number) => {
          console.log(`[Tunnel] Process exited with code ${code}`);
          tunnelInfo = { url: null, isRunning: false, protocol: null };
        });
        resolve(url);
      } else {
        stop();
        reject(error);
      }
    };

    // Buffer.includes(string) 做字节级搜索，避免每次 toString 分配
    const onStderr = (data: Buffer) => {
      if (settled || protocol !== "quic") return;
      if (data.includes(QUIC_FAIL_SIGNAL)) {
        settle(null, new Error("QUIC connection failed"));
      } else if (tunnelUrl && data.includes(REGISTERED_SIGNAL)) {
        settle(tunnelUrl);
      }
    };

    const onExit = () =>
      settle(null, new Error("cloudflared exited unexpectedly"));

    if (protocol === "quic") {
      child.stderr?.on("data", onStderr);
      timer = setTimeout(
        () => settle(null, new Error("QUIC connection timeout")),
        15_000
      );
    }
    child.on("exit", onExit);

    url
      .then((resolved) => {
        if (settled) return;
        if (protocol === "quic") {
          tunnelUrl = resolved;
        } else {
          settle(resolved);
        }
      })
      .catch((err) => settle(null, err));
  });
}

export function getTunnelInfo(): TunnelInfo {
  return tunnelInfo;
}

export function stopTunnel() {
  if (stopFn) {
    stopFn();
    tunnelInfo = { url: null, isRunning: false, protocol: null };
    stopFn = null;
    console.log("[Tunnel] Stopped");
  }
}
