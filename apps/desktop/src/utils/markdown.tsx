import React from "react";
import { Streamdown } from "streamdown";
import Mermaid from "@/components/Mermaid";
import { FileCode } from "@/components/Icons";

const ReactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3964fe" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 align-middle">
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(30 12 12)" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(90 12 12)" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(150 12 12)" />
    <circle cx="12" cy="12" r="2" fill="#3964fe" />
  </svg>
);

const components = {
  h1: ({ children }: any) => (
    <h1 className="text-2xl font-bold tracking-tight mt-6 mb-4 text-zinc-900 dark:text-zinc-100 leading-tight">
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-[17px] font-bold tracking-tight mt-5 mb-3 text-zinc-900 dark:text-zinc-100 leading-tight">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-[15px] font-bold mt-4 mb-2.5 text-zinc-900 dark:text-zinc-100 leading-tight">
      {children}
    </h3>
  ),
  h4: ({ children }: any) => (
    <h4 className="text-sm font-semibold mt-3.5 mb-2 text-zinc-800 dark:text-zinc-200 leading-snug">
      {children}
    </h4>
  ),
  h5: ({ children }: any) => (
    <h5 className="text-sm font-semibold mt-3 mb-1.5 text-zinc-800 dark:text-zinc-200 leading-snug">
      {children}
    </h5>
  ),
  h6: ({ children }: any) => (
    <h6 className="text-sm font-semibold mt-2.5 mb-1.5 text-zinc-800 dark:text-zinc-200 leading-snug">
      {children}
    </h6>
  ),
  pre: ({ children }: any) => (
    <pre className="my-2.5 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#f5f5f7] dark:bg-[#18181b] overflow-x-auto max-w-full">
      {children}
    </pre>
  ),
  ul: ({ children }: any) => (
    <ul className="my-2 pl-5 list-disc text-zinc-800 dark:text-zinc-200 text-[13px] leading-relaxed">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="my-2 pl-5 list-decimal text-zinc-800 dark:text-zinc-200 text-[13px] leading-relaxed">
      {children}
    </ol>
  ),
  p: ({ children }: any) => (
    <p className="mb-3 leading-relaxed text-[#1d1d1f] dark:text-[#e3e3e8] text-[13px]">
      {children}
    </p>
  ),
  a: ({ href, children }: any) => {
    if (href?.startsWith("file://")) {
      const title = children ? String(children) : (href.split("/").pop() || "");
      const isReactFile = title.endsWith(".tsx") || title.endsWith(".jsx") || title.endsWith(".ts") || title.endsWith(".js");
      return (
        <a 
          href={href} 
          className="inline-flex items-center gap-1 mx-0.5 text-inherit no-underline font-mono font-semibold align-middle bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] px-1 rounded-sm border border-zinc-200 dark:border-zinc-800"
        >
          {isReactFile ? <ReactIcon /> : <span className="text-brand-blue dark:text-deepseek-400 inline-flex items-center"><FileCode /></span>}
          <span className="no-underline">{title}</span>
        </a>
      );
    }
    return <a href={href} className="text-brand-blue hover:underline">{children}</a>;
  },
  code: ({ className, children }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    if (lang === "mermaid") {
      return <Mermaid chart={String(children).trim()} />;
    }
    const isBlock = !!className || String(children).includes("\n");
    if (isBlock) {
      return (
        <code className={`${className || ""} bg-transparent p-0 border-0 text-xs text-zinc-800 dark:text-[#f5f5f7] font-mono whitespace-pre`}>
          {children}
        </code>
      );
    }
    return (
      <code className={`${className || ""} bg-deepseek-50 dark:bg-deepseek-900/30 px-1 py-0.5 rounded-sm font-mono text-[11px] border border-deepseek-200/60 dark:border-deepseek-800/80 text-deepseek-500 dark:text-deepseek-300 break-all`}>
        {children}
      </code>
    );
  },
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-[3px] border-zinc-300 dark:border-zinc-600 pl-3 my-2 not-italic text-zinc-600 dark:text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => null,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-3 border border-zinc-200 dark:border-zinc-800 rounded-md">
      <table className="w-full text-left border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-[#f2f2f7] dark:bg-[#2c2c2e] border-b border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-300">
      {children}
    </thead>
  ),
  th: ({ children, style }: any) => (
    <th className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 text-sm font-semibold" style={style}>
      <span className="block max-w-[160px] whitespace-nowrap overflow-hidden text-ellipsis">{children}</span>
    </th>
  ),
  td: ({ children, style }: any) => (
    <td className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-[#f5f5f7] break-words" style={style}>
      {children}
    </td>
  ),
  tr: ({ children }: any) => (
    <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 odd:bg-white even:bg-zinc-50/20 dark:odd:bg-transparent dark:even:bg-zinc-800/10">
      {children}
    </tr>
  )
};

export function renderMarkdown(text: string, isAnimating: boolean = false) {
  return (
    <div className="min-w-0 w-full overflow-hidden">
      <Streamdown isAnimating={isAnimating} caret="block" components={components}>
        {text}
      </Streamdown>
    </div>
  );
}

export function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(file:\/\/.*?\))/g;
  const splitParts = text.split(tokenRegex);

  splitParts.forEach((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      parts.push(<strong key={index}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      parts.push(<code key={index}>{part.slice(1, -1)}</code>);
    } else if (part.startsWith("[") && part.includes("](file://")) {
      const linkMatch = part.match(/\[(.*?)\]\((file:\/\/.*?)\)/);
      if (linkMatch) {
        const title = linkMatch[1];
        const path = linkMatch[2];
        const isReactFile = title.endsWith(".tsx") || title.endsWith(".jsx") || title.endsWith(".ts") || title.endsWith(".js");
        parts.push(
          <a 
            key={index} 
            href={path} 
            className="inline-flex items-center gap-1 mx-0.5 text-inherit no-underline font-mono font-semibold align-middle bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] px-1 rounded-sm border border-zinc-200 dark:border-zinc-800"
          >
            {isReactFile ? <ReactIcon /> : <span className="text-brand-blue dark:text-deepseek-400 inline-flex items-center"><FileCode /></span>}
            <span className="no-underline">{title}</span>
          </a>
        );
      } else {
        parts.push(part);
      }
    } else {
      parts.push(part);
    }
  });

  return parts;
}
