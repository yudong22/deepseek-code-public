import React from "react";
import Mermaid from "@/components/Mermaid";
import { FileCode } from "@/components/Icons";

const ReactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: "middle" }}>
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(30 12 12)" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(90 12 12)" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(150 12 12)" />
    <circle cx="12" cy="12" r="2" fill="#007aff" />
  </svg>
);

/** 渲染完整的 Markdown 文本 */
export function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  // 表格状态
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let tableAlignments: ("left" | "center" | "right")[] = [];

  const pushTable = (keyIndex: number) => {
    if (tableHeaders.length === 0) return;
    elements.push(
      <div key={`table-${keyIndex}`} className="markdown-table-wrapper">
        <table>
          <thead>
            <tr>
              {tableHeaders.map((header, hIdx) => (
                <th 
                  key={hIdx} 
                  style={{ 
                    textAlign: tableAlignments[hIdx] || "left"
                  }}
                >
                  {parseInlineMarkdown(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td 
                    key={cIdx} 
                    style={{ 
                      textAlign: tableAlignments[cIdx] || "left"
                    }}
                  >
                    {parseInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    // 重置
    inTable = false;
    tableHeaders = [];
    tableRows = [];
    tableAlignments = [];
  };

  // 列表状态
  let currentListType: "ul" | "ol" | null = null;
  let currentListItems: React.ReactNode[] = [];

  const pushList = (keyIndex: number) => {
    if (!currentListType) return;
    if (currentListType === "ul") {
      elements.push(
        <ul key={`ul-${keyIndex}`} style={{ margin: "4px 0 6px 20px" }}>
          {currentListItems}
        </ul>
      );
    } else if (currentListType === "ol") {
      elements.push(
        <ol key={`ol-${keyIndex}`} style={{ margin: "4px 0 6px 20px" }}>
          {currentListItems}
        </ol>
      );
    }
    // 重置
    currentListType = null;
    currentListItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    if (line.startsWith("```")) {
      if (inTable) pushTable(i);
      if (currentListType) pushList(i);
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

    // 空行
    if (line.trim() === "") {
      if (inTable) pushTable(i);
      if (currentListType) pushList(i);
      continue;
    }

    // Markdown 表格解析
    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableRow) {
      if (currentListType) pushList(i);
      if (!inTable) {
        // 检查下一行是否是分隔符行
        const nextLine = lines[i + 1];
        const isSeparator = nextLine && nextLine.trim().startsWith("|") && /^[|\s:-]+$/.test(nextLine.trim());
        if (isSeparator) {
          tableHeaders = line.split("|").map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          const sepParts = nextLine.split("|").map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          tableAlignments = sepParts.map(p => {
            if (p.startsWith(":") && p.endsWith(":")) return "center";
            if (p.endsWith(":")) return "right";
            return "left";
          });
          inTable = true;
          i++; // 跳过分隔符行
          continue;
        }
      } else {
        const rowCells = line.split("|").map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(rowCells);
        continue;
      }
    }

    // 如果当前行不是表格行，但我们正处于表格状态中，先输出之前的表格
    if (!isTableRow && inTable) {
      pushTable(i);
    }

    // 标题
    if (line.startsWith("### ")) {
      if (currentListType) pushList(i);
      elements.push(<h3 key={`h3-${i}`} style={{ marginTop: "14px", marginBottom: "6px", fontSize: "14px", fontWeight: "600" }}>{parseInlineMarkdown(line.slice(4))}</h3>);
      continue;
    }

    // 无序列表
    if (line.startsWith("- ")) {
      if (currentListType === "ol") pushList(i);
      if (!currentListType) {
        currentListType = "ul";
      }
      currentListItems.push(
        <li key={`li-${i}`}>{parseInlineMarkdown(line.slice(2))}</li>
      );
      continue;
    }

    // 有序列表
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      if (currentListType === "ul") pushList(i);
      if (!currentListType) {
        currentListType = "ol";
      }
      currentListItems.push(
        <li key={`li-${i}`}>{parseInlineMarkdown(numMatch[2])}</li>
      );
      continue;
    }

    // 纯文本 / 段落
    if (currentListType) pushList(i);
    elements.push(<p key={`p-${i}`} style={{ marginBottom: "10px" }}>{parseInlineMarkdown(line)}</p>);
  }

  // 循环结束，检查是否还有未输出的表格或列表
  if (inTable) {
    pushTable(lines.length);
  }
  if (currentListType) {
    pushList(lines.length);
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
        const isReactFile = title.endsWith(".tsx") || title.endsWith(".jsx") || title.endsWith(".ts") || title.endsWith(".js");
        parts.push(
          <a 
            key={index} 
            href={path} 
            className="inline-file-link"
            style={{ 
              display: "inline-flex", 
              alignItems: "center", 
              gap: "4px", 
              margin: "0 2px",
              color: "inherit",
              textDecoration: "none",
              fontFamily: "Consolas, Monaco, monospace",
              fontWeight: "600",
              verticalAlign: "middle"
            }}
          >
            {isReactFile ? <ReactIcon /> : <span style={{ color: "#007aff", display: "inline-flex", alignItems: "center" }}><FileCode /></span>}
            <span className="file-name-text" style={{ textDecoration: "none" }}>{title}</span>
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
