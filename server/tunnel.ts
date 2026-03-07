import { tunnel as startTunnel } from "cloudflared";

interface TunnelInfo {
  url: string | null;
  isRunning: boolean;
}

let tunnelInfo: TunnelInfo = { url: null, isRunning: false };
let stopFn: (() => void) | null = null;

export async function launchTunnel(port: number): Promise<string> {
  console.log("[Tunnel] Starting Cloudflare Tunnel...");

  const { url, child, stop } = startTunnel({
    "--url": `localhost:${port}`,
  });

  const tunnelUrl = await url;
  console.log(`[Tunnel] URL: ${tunnelUrl}`);

  tunnelInfo = { url: tunnelUrl, isRunning: true };
  stopFn = stop;

  child.on("exit", (code: number) => {
    console.log(`[Tunnel] Process exited with code ${code}`);
    tunnelInfo = { url: null, isRunning: false };
  });

  return tunnelUrl;
}

export function getTunnelInfo(): TunnelInfo {
  return { ...tunnelInfo };
}

export function stopTunnel() {
  if (stopFn) {
    stopFn();
    tunnelInfo = { url: null, isRunning: false };
    stopFn = null;
    console.log("[Tunnel] Stopped");
  }
}
