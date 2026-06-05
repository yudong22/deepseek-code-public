import React from "react";
import Mermaid from "@/components/Mermaid";
import { FileCode } from "@/components/Icons";

// --- 自定义行内 Markdown 渲染器 ---

/** 渲染完整的 Markdown 文本 */
export function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // 代码块结束
        if (codeBlockLang === "mermaid") {
          elements.push(
            <Mermaid key={`mermaid-${i}`} chart={codeBlockContent.join("\n")} />
          );
        } else {
          elements.push(
            <pre key={`code-${i}`}>
              <code className={codeBlockLang}>{codeBlockContent.join("\n")}</code>
            </pre>
          );
        }
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // 代码块开始
        inCodeBlock = true;
        codeBlockLang = line.replace("```", "").trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 标题
    if (line.startsWith("### ")) {
      elements.push(<h3 key={`h3-${i}`} style={{ marginTop: "14px", marginBottom: "6px", fontSize: "14px", fontWeight: "600" }}>{parseInlineMarkdown(line.slice(4))}</h3>);
      continue;
    }

    // 无序列表
    if (line.startsWith("- ")) {
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: "4px 0 6px 20px" }}>
          <li>{parseInlineMarkdown(line.slice(2))}</li>
        </ul>
      );
      continue;
    }

    // 有序列表
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: "4px 0 6px 20px" }}>
          <li>{parseInlineMarkdown(numMatch[2])}</li>
        </ol>
      );
      continue;
    }

    // 纯文本 / 段落
    if (line.trim() !== "") {
      elements.push(<p key={`p-${i}`} style={{ marginBottom: "10px" }}>{parseInlineMarkdown(line)}</p>);
    }
  }

  return elements;
}

/** 解析行内 Markdown 格式（粗体、行内代码、文件链接） */
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
        parts.push(
          <a key={index} href={path} className="file-item-left" style={{ display: "inline-flex", alignItems: "center", gap: "3px", margin: "0 2px" }}>
            <FileCode />
            {title}
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
