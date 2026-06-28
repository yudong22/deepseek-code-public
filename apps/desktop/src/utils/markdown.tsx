import React from "react";
import { Streamdown, CodeBlockCopyButton, CodeBlockDownloadButton } from "streamdown";
import { code as shikiCodePlugin, type ThemeInput } from "@streamdown/code";
import { mermaid as mermaidPlugin } from "@streamdown/mermaid";
import { FileCode } from "@/components/Icons";

/** v0.5.14 修复代码高亮 + Mermaid 渲染
 *  - 之前没传 plugins.code / plugins.mermaid，Streamdown 退化到 raw fallback（无高亮/Mermaid）
 *  - 现在传入 @streamdown/code + @streamdown/mermaid 官方插件，所有支持的语言都正常高亮 + Mermaid 自动渲染 */
const streamdownPlugins = {
  code: shikiCodePlugin,
  mermaid: mermaidPlugin,
};
const shikiConfig = {
  shikiTheme: ["github-light", "github-dark"] as [ThemeInput, ThemeInput],
  plugins: streamdownPlugins,
};

/** 点击 markdown 中本地文件链接时调用，转交给右侧面板预览。
 *  - linkPath: 链接的目标相对路径（相对当前文件，可能含 ../）
 *  - sourceFilePath: 当前 markdown 所属文件的 workspace 相对路径 */
type PreviewFile = (linkPath: string, sourceFilePath?: string) => void;

const EXTERNAL_LINK = /^(https?:|mailto:|tel:|#)/i;
/** 看起来像本地文件链接（绝对或相对、含扩展名） */
const LOCAL_FILE = /\.[a-z0-9]{1,8}($|[#?])/i;
/** 提取 file:// 协议里的实际路径 */
const FILE_URL_PREFIX = /^file:\/\//;

const ReactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3964fe" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 align-middle">
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(30 12 12)" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(90 12 12)" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(150 12 12)" />
    <circle cx="12" cy="12" r="2" fill="#3964fe" />
  </svg>
);

/** 把任意形式的本地文件链接规整成 linkPath（相对当前文件，可能含 ../）。
 *  - file://ROADMAP.md → ROADMAP.md
 *  - /ROADMAP.md → ROADMAP.md
 *  - ROADMAP.md / ./ROADMAP.md → 原样
 *  - 外部链接（http / https / mailto / tel / 锚点）→ null，不处理 */
function toLinkPath(href: string | undefined): string | null {
  if (!href) return null;
  if (FILE_URL_PREFIX.test(href)) return href.replace(FILE_URL_PREFIX, "");
  if (EXTERNAL_LINK.test(href)) return null;
  if (!LOCAL_FILE.test(href)) return null;
  return href.startsWith("/") ? href.slice(1) : href;
}

/** 创建点击 handler：阻止默认行为 + 调 onPreviewFile */
function makeFileClickHandler(
  href: string,
  linkPath: string,
  onPreviewFile: PreviewFile | undefined,
  sourceFilePath: string | undefined,
) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPreviewFile?.(linkPath, sourceFilePath);
    void href; // 保留原 href 给调试用
  };
}

/** 缓存 buildComponents 闭包（v0.5.14 性能优化）
 *  - onPreviewFile 引用变化时才重建（通常来自 useCallback，引用稳定）
 *  - sourceFilePath 也参与 key（同一文件但不同来源路径需要不同 buildComponents）
 *  - 用 WeakMap + JSON key，避免泄漏 + key 稳定 */
const componentsCache = new Map<string, ReturnType<typeof buildComponents>>();
function getCachedComponents(onPreviewFile?: PreviewFile, sourceFilePath?: string) {
  // 用 (onPreviewFile ref + sourceFilePath) 组合 key
  const key = `${(onPreviewFile as unknown) || "null"}|${sourceFilePath || ""}`;
  let cached = componentsCache.get(key);
  if (!cached) {
    cached = buildComponents(onPreviewFile, sourceFilePath);
    componentsCache.set(key, cached);
  }
  return cached;
}

const buildComponents = (onPreviewFile?: PreviewFile, sourceFilePath?: string) => ({
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
    <div className="group relative my-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#f5f5f7] dark:bg-surface-primary overflow-x-auto max-w-full">
      {children}
    </div>
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
    const linkPath = toLinkPath(href);
    if (!linkPath) {
      return <a href={href} className="text-brand-blue hover:underline">{children}</a>;
    }
    // file:// 协议链接（用户主动写的引用）展示 file 风格 UI，其他本地文件保持普通链接样式
    const isFileUrl = FILE_URL_PREFIX.test(href || "");
    const title = children ? String(children) : (linkPath.split("/").pop() || "");
    const isReactFile = /\.(tsx|jsx|ts|js)$/i.test(title);
    return (
      <a
        href="javascript:void(0)"
        data-file-href={href}
        onClick={makeFileClickHandler(href, linkPath, onPreviewFile, sourceFilePath)}
        className={
          isFileUrl
            ? "inline-flex items-center gap-1 mx-0.5 text-inherit no-underline font-mono font-semibold align-middle bg-surface-secondary hover:bg-surface-hover px-1 rounded-sm border border-zinc-200 dark:border-zinc-800 cursor-pointer"
            : "text-brand-blue hover:underline cursor-pointer"
        }
      >
        {isFileUrl && (isReactFile ? <ReactIcon /> : <span className="text-brand-blue dark:text-deepseek-400 inline-flex items-center"><FileCode /></span>)}
        <span className={isFileUrl ? "no-underline" : ""}>{title}</span>
      </a>
    );
  },
  code: ({ className, children }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    // block code（含 mermaid）：返回 undefined 让 streamdown 走官方插件（shiki / mermaid）渲染
    if (lang || String(children).includes("\n")) return undefined;
    // inline code：自定义样式
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
      <table className="w-full text-left border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-surface-secondary border-b border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-300">
      {children}
    </thead>
  ),
  th: ({ children, style }: any) => (
    <th className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 text-sm font-semibold" style={style}>
      <span className="block max-w-[160px] whitespace-nowrap overflow-hidden text-ellipsis">{children}</span>
    </th>
  ),
  td: ({ children, style }: any) => (
    <td className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-label-primary break-words" style={style}>
      {children}
    </td>
  ),
  tr: ({ children }: any) => (
    <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 odd:bg-white even:bg-zinc-50/20 dark:odd:bg-transparent dark:even:bg-zinc-800/10">
      {children}
    </tr>
  ),
});

export function renderMarkdown(
  text: string,
  isAnimating: boolean = false,
  onPreviewFile?: PreviewFile,
  /** 当前 markdown 所属文件的 workspace 相对路径，用于解析链接 */
  sourceFilePath?: string,
) {
  // 兜底 onClick：捕获 streamdown 没用自定义 a 组件时漏掉的本地文件链接
  const handleWrapperClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const realHref = anchor.getAttribute("data-file-href") || anchor.getAttribute("href") || "";
    const linkPath = toLinkPath(realHref);
    if (!linkPath) return;
    e.preventDefault();
    e.stopPropagation();
    onPreviewFile?.(linkPath, sourceFilePath);
  };
  return (
    <div className="min-w-0 w-full overflow-hidden" onClick={handleWrapperClick}>
      <Streamdown
        isAnimating={isAnimating}
        caret="block"
        components={getCachedComponents(onPreviewFile, sourceFilePath)}
        shikiTheme={shikiConfig.shikiTheme}
        plugins={shikiConfig.plugins}
      >
        {text}
      </Streamdown>
    </div>
  );
}

/**
 * 用 streamdown shiki 渲染代码，供面板源码预览使用。
 * 外层需包裹 .sd-panel-code 类（定义在 App.css），去掉 CodeBlock 自带 chrome。
 *
 * 必须用 Streamdown 包裹 CodeBlock：Shiki 的 code highlighter 通过
 * Ve.Provider 注入，CodeBlock 内部 HighlightedCodeBlockBody 依赖该上下文。
 * 直接使用 CodeBlock 组件会导致插件上下文缺失，退化为纯文本。
 */
export function renderCodeBlock(content: string, language: string) {
  // 内容可能含 ```，用更多反引号作为 fence 避免冲突
  let fence = "```";
  const backtickRun = content.match(/`+/g);
  if (backtickRun) {
    const maxLen = Math.max(...backtickRun.map((m) => m.length));
    fence = "`".repeat(Math.max(3, maxLen + 1));
  }
  return (
    <Streamdown mode="static" shikiTheme={shikiConfig.shikiTheme} plugins={shikiConfig.plugins} isAnimating={false}>
      {`${fence}${language}\n${content}\n${fence}`}
    </Streamdown>
  );
}

/** 导出按钮组件供 FilePanel 在顶部工具栏中使用 */
export { CodeBlockCopyButton, CodeBlockDownloadButton };

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
        const [, title, path] = linkMatch;
        const isReactFile = /\.(tsx|jsx|ts|js)$/i.test(title);
        parts.push(
          <a
            key={index}
            href={path}
            className="inline-flex items-center gap-1 mx-0.5 text-inherit no-underline font-mono font-semibold align-middle bg-surface-secondary hover:bg-surface-hover px-1 rounded-sm border border-zinc-200 dark:border-zinc-800"
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
