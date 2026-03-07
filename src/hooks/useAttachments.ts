import { useState, useCallback } from "react";
import type { Attachment } from "../types/messages";

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachments = useCallback((files: FileList) => {
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      uploadStatus: "pending" as const,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const uploadAll = useCallback(
    async (token: string): Promise<string[]> => {
      const pending = attachments.filter((a) => a.uploadStatus === "pending");
      if (pending.length === 0) return attachments.filter((a) => a.serverPath).map((a) => a.serverPath!);

      const paths: string[] = [];

      for (const att of pending) {
        setAttachments((prev) =>
          prev.map((a) => (a.id === att.id ? { ...a, uploadStatus: "uploading" as const } : a))
        );

        try {
          const formData = new FormData();
          formData.append("file", att.file);

          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Upload failed" }));
            throw new Error((err as { error: string }).error);
          }

          const data = (await res.json()) as { filePath: string };
          paths.push(data.filePath);

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === att.id ? { ...a, uploadStatus: "done" as const, serverPath: data.filePath } : a
            )
          );
        } catch {
          setAttachments((prev) =>
            prev.map((a) => (a.id === att.id ? { ...a, uploadStatus: "error" as const } : a))
          );
        }
      }

      // 也返回已上传的文件
      const existing = attachments
        .filter((a) => a.uploadStatus === "done" && a.serverPath)
        .map((a) => a.serverPath!);

      return [...existing, ...paths];
    },
    [attachments]
  );

  const clear = useCallback(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.preview) URL.revokeObjectURL(att.preview);
      }
      return [];
    });
  }, []);

  return { attachments, addAttachments, removeAttachment, uploadAll, clear };
}
