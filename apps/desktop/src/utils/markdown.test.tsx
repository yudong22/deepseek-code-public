import { describe, expect, test } from "bun:test";
import React from "react";
import { renderMarkdown, parseInlineMarkdown } from "./markdown";
import { Streamdown } from "streamdown";

describe("Markdown Renderer Wrapper", () => {
  test("should render Streamdown component with correct props", () => {
    const markdown = "Hello world";
    const element = renderMarkdown(markdown, true);

    expect(element).toBeDefined();
    expect(element.type).toBe("div");
    // Streamdown 被包裹在 div 中，检查子元素
    const child = element.props.children;
    expect(child).toBeDefined();
    expect(child.type).toBe(Streamdown);
    expect(child.props.children).toBe(markdown);
    expect(child.props.isAnimating).toBe(true);
    expect(child.props.caret).toBe("block");
    // shikiTheme 应是 light/dark 数组
    expect(child.props.shikiTheme).toEqual(["github-light", "github-dark"]);
  });

  test("should accept onPreviewFile callback", () => {
    const cb = () => {};
    const element = renderMarkdown("test", false, cb);
    const child = element.props.children;
    expect(child.type).toBe(Streamdown);
    // 验证 components 是函数返回的（不是模块级常量）
    expect(typeof child.props.components).toBe("object");
  });
});

describe("Inline Markdown Parser", () => {
  test("should parse bold text", () => {
    const parts = parseInlineMarkdown("hello **bold** world");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("hello ");
    
    const boldPart = parts[1] as React.ReactElement;
    expect(boldPart.type).toBe("strong");
    expect(boldPart.props.children).toBe("bold");
    
    expect(parts[2]).toBe(" world");
  });

  test("should parse inline code", () => {
    const parts = parseInlineMarkdown("hello `code` world");
    expect(parts.length).toBe(3);
    
    const codePart = parts[1] as React.ReactElement;
    expect(codePart.type).toBe("code");
    expect(codePart.props.children).toBe("code");
  });

  test("should parse file links", () => {
    const parts = parseInlineMarkdown("check [App.tsx](file:///path/to/App.tsx)");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("check ");
    
    const linkPart = parts[1] as React.ReactElement;
    expect(linkPart.type).toBe("a");
    expect(linkPart.props.href).toBe("file:///path/to/App.tsx");
    
    const children = React.Children.toArray(linkPart.props.children);
    expect(children.length).toBe(2);
    
    expect(parts[2]).toBe("");
  });
});
