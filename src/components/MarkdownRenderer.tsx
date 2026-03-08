import { memo, useMemo } from "react";
import { Streamdown, type Components } from "streamdown";
import { code } from "@streamdown/code";

const plugins = { code };

function createComponents(variant: "user" | "assistant"): Components {
  const isUser = variant === "user";

  const inlineCodeClass = isUser
    ? "bg-white/15 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-white/20"
    : "bg-(--color-code-bg) px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-(--color-code-border)";

  return {
    h1: ({ children, ...props }) => (
      <h1 className="text-lg font-semibold mt-4 mb-2 first:mt-0" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="text-base font-semibold mt-4 mb-2 first:mt-0" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0" {...props}>
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4
        className="text-sm font-semibold mt-2 mb-1 first:mt-0"
        {...props}
      >
        {children}
      </h4>
    ),
    p: ({ children, ...props }) => (
      <p className="mb-3 last:mb-0 leading-relaxed" {...props}>
        {children}
      </p>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children, ...props }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={
          isUser
            ? "underline underline-offset-2"
            : "text-primary underline underline-offset-2 hover:text-primary/80"
        }
        {...props}
      >
        {children}
      </a>
    ),
    code: ({ children, className, ...props }) => {
      const isInline = !className?.includes("language-");
      if (isInline) {
        return (
          <code className={inlineCodeClass} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre
        className="bg-(--color-code-bg) backdrop-blur-sm rounded-xl p-3.5 my-2.5 overflow-x-auto font-mono text-[13px] leading-normal border border-(--color-code-border)"
        {...props}
      >
        {children}
      </pre>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-5 mb-3 last:mb-0 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-5 mb-3 last:mb-0 space-y-1">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={
          isUser
            ? "border-l-2 border-white/30 pl-3 my-2 italic opacity-90"
            : "border-l-2 border-primary/30 pl-3 my-2 italic text-muted-foreground"
        }
      >
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => (
      <th className="text-left font-semibold px-3 py-1.5 border-b border-(--color-overlay-border)">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-1.5 border-b border-(--color-overlay-border)/50">
        {children}
      </td>
    ),
    hr: () => <hr className="my-4 border-t border-(--color-overlay-border)" />,
    img: ({ src, alt, ...props }) => (
      <img src={src} alt={alt} className="max-w-full rounded-lg my-2" {...props} />
    ),
  };
}

interface Props {
  text: string;
  variant?: "user" | "assistant";
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
  variant = "assistant",
}: Props) {
  const components = useMemo(() => createComponents(variant), [variant]);

  if (!text) return null;

  return (
    <div className="leading-relaxed break-words">
      <Streamdown
        components={components}
        plugins={plugins}
        shikiTheme={["github-light", "github-dark"]}
      >
        {text}
      </Streamdown>
    </div>
  );
});
