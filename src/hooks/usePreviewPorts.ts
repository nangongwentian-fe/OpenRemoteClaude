import { useState, useCallback } from "react";

export interface DetectedPort {
  terminalId: string;
  port: number;
  url: string;
}

export function usePreviewPorts() {
  const [detectedPorts, setDetectedPorts] = useState<DetectedPort[]>([]);
  const [activePreviewPort, setActivePreviewPort] = useState<number | null>(null);
  const [customPreviewUrl, setCustomPreviewUrl] = useState("");

  const handlePortDetected = useCallback(
    (msg: { payload: { terminalId: string; port: number; url: string } }) => {
      const { terminalId, port, url } = msg.payload;
      setDetectedPorts((prev) => {
        if (prev.some((p) => p.port === port)) return prev;
        return [...prev, { terminalId, port, url }];
      });
      // 自动选择第一个检测到的端口
      setActivePreviewPort((prev) => prev ?? port);
    },
    []
  );

  const removePortsForTerminal = useCallback((terminalId: string) => {
    setDetectedPorts((prev) => {
      const next = prev.filter((p) => p.terminalId !== terminalId);
      // 如果当前预览的端口被移除，重置
      setActivePreviewPort((current) => {
        if (current && !next.some((p) => p.port === current)) {
          return next[0]?.port ?? null;
        }
        return current;
      });
      return next;
    });
  }, []);

  return {
    detectedPorts,
    activePreviewPort,
    setActivePreviewPort,
    customPreviewUrl,
    setCustomPreviewUrl,
    handlePortDetected,
    removePortsForTerminal,
  };
}
