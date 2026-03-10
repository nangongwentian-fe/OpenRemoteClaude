import { useState, useRef } from "react";
import { Globe, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import type { DetectedPort } from "../hooks/usePreviewPorts";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHostname(hostname: string) {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function isLocalWorkbenchHost() {
  if (typeof window === "undefined") return false;
  return isLocalHostname(window.location.hostname);
}

function buildPreviewUrlForPort(port: number) {
  return isLocalWorkbenchHost()
    ? `http://localhost:${port}/`
    : `/api/preview/${port}/`;
}

function buildProxyUrlForLocalTarget(url: URL) {
  const fallbackPort = url.protocol === "https:" ? "443" : "80";
  const port = parseInt(url.port || fallbackPort, 10);
  const proxiedPath = url.pathname || "/";
  return {
    port,
    proxiedUrl: `/api/preview/${port}${proxiedPath}${url.search}`,
  };
}

interface Props {
  detectedPorts: DetectedPort[];
  activePort: number | null;
  onSelectPort: (port: number) => void;
  customUrl: string;
  onSetCustomUrl: (url: string) => void;
}

export function WebPreview({
  detectedPorts,
  activePort,
  onSelectPort,
  customUrl,
  onSetCustomUrl,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [urlInput, setUrlInput] = useState("");

  const previewUrl = customUrl || (activePort ? buildPreviewUrlForPort(activePort) : null);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      // 如果是端口号，按当前访问环境自动选择直连或代理
      const portMatch = urlInput.match(/^(\d{1,5})$/);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        onSelectPort(port);
        onSetCustomUrl("");
      } else if (/^https?:\/\//i.test(urlInput)) {
        // 本地地址根据当前访问方式分流：本地工作台直连，远程工作台走代理
        try {
          const url = new URL(urlInput);
          if (isLocalHostname(url.hostname)) {
            const { port, proxiedUrl } = buildProxyUrlForLocalTarget(url);
            if (port > 0 && port <= 65535) {
              onSelectPort(port);
            }

            if (isLocalWorkbenchHost()) {
              onSetCustomUrl(url.toString());
            } else {
              onSetCustomUrl(proxiedUrl);
            }
          } else {
            onSetCustomUrl(url.toString());
          }
        } catch {
          onSetCustomUrl(urlInput);
        }
      } else {
        onSetCustomUrl(urlInput);
      }
      setUrlInput("");
    }
  };

  if (!previewUrl && detectedPorts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="relative mb-6">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
            <Globe className="size-8 text-primary/60" />
          </div>
          <div className="absolute inset-0 size-16 rounded-2xl bg-primary/5 blur-xl" />
        </div>
        <h2 className="text-lg font-semibold text-foreground/90 mb-2">
          No preview available
        </h2>
        <p className="text-sm text-muted-foreground/70 max-w-[280px] leading-relaxed mb-4">
          Start a dev server in the Terminal to preview your app here.
        </p>
        <form onSubmit={handleUrlSubmit} className="flex gap-2 w-full max-w-[320px]">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Port or URL (e.g. 3000)"
            className="flex-1 px-3 py-1.5 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30"
          />
          <Button type="submit" size="sm" variant="outline" className="shrink-0">
            Open
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Address bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-(--color-overlay-border) bg-card/50 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-md"
          onClick={handleRefresh}
          title="Refresh"
        >
          <RefreshCw className="size-3.5" />
        </Button>

        {/* Port selector */}
        {detectedPorts.length > 1 ? (
          <select
            value={activePort ?? ""}
            onChange={(e) => onSelectPort(parseInt(e.target.value, 10))}
            className="px-2 py-1 rounded-md border border-(--color-overlay-border) bg-(--color-overlay) text-xs text-foreground outline-none"
          >
            {detectedPorts.map((p) => (
              <option key={p.port} value={p.port}>
                :{p.port}
              </option>
            ))}
          </select>
        ) : activePort ? (
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-md bg-(--color-overlay)">
            :{activePort}
          </span>
        ) : null}

        {/* URL display */}
        <div className="flex-1 min-w-0">
          <form onSubmit={handleUrlSubmit} className="flex">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={previewUrl || "Enter port or URL..."}
              className="w-full px-2 py-1 rounded-md text-xs text-muted-foreground bg-transparent outline-none placeholder:text-muted-foreground/40 focus:bg-(--color-overlay) focus:text-foreground"
            />
          </form>
        </div>

        {previewUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            onClick={() => window.open(previewUrl, "_blank")}
            title="Open in new tab"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        )}
      </div>

      {/* iframe */}
      {previewUrl ? (
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="flex-1 w-full border-0 bg-white"
          title="Web Preview"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a port to preview
        </div>
      )}
    </div>
  );
}
