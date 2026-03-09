import { useState, useEffect } from "react";
import type { ThemedToken } from "shiki";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highlighterPromise: Promise<any> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-light", "github-dark"],
        langs: [],
      })
    );
  }
  return highlighterPromise;
}

function toReactStyleKey(key: string): string {
  if (key.startsWith("--")) {
    return key;
  }

  return key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function normalizeStyleObject(
  input: Record<string, string | number | undefined | null>
): React.CSSProperties | undefined {
  const style: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === "") {
      continue;
    }
    style[toReactStyleKey(key)] = value;
  }

  return Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined;
}

/** Normalize Shiki token styles into a React-compatible style object. */
export function tokenStyle(token: ThemedToken): React.CSSProperties | undefined {
  const raw = token.htmlStyle;
  if (!raw) {
    return token.color ? { color: token.color } : undefined;
  }

  if (typeof raw === "object") {
    return normalizeStyleObject(raw as Record<string, string | number | undefined | null>);
  }

  const style: Record<string, string> = {};
  const str = String(raw);
  for (const segment of str.split(";")) {
    const idx = segment.indexOf(":");
    if (idx > 0) {
      style[toReactStyleKey(segment.slice(0, idx).trim())] = segment.slice(idx + 1).trim();
    }
  }

  if (Object.keys(style).length === 0) {
    return token.color ? { color: token.color } : undefined;
  }

  return style as React.CSSProperties;
}

export function useHighlightedCode(
  code: string | undefined,
  language: string | undefined
): ThemedToken[][] | null {
  const [lines, setLines] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    if (!code || !language) {
      setLines(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const hl = await getHighlighter();

        // Load language on demand
        const loaded = hl.getLoadedLanguages() as string[];
        if (!loaded.includes(language)) {
          await hl.loadLanguage(language);
        }

        const result = hl.codeToTokens(code, {
          lang: language,
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
        });

        if (!cancelled) {
          setLines(result.tokens);
        }
      } catch (e) {
        console.warn("[useHighlightedCode] failed for", language, e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return lines;
}
