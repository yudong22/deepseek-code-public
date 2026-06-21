import { describe, expect, test } from "bun:test";
import React from "react";
import { renderMarkdown } from "./markdown";

describe("Markdown Parser - Lists", () => {
  test("should render consecutive ordered list items in a single ol", () => {
    const markdown = "1. First item\n2. Second item\n3. Third item";
    const elements = renderMarkdown(markdown);
    
    // elements should contain exactly one ol
    expect(elements.length).toBe(1);
    
    const ol = elements[0] as React.ReactElement;
    expect(ol.type).toBe("ol");
    expect(ol.props.start).toBeUndefined(); // starts at 1 by default
    
    const children = React.Children.toArray(ol.props.children);
    expect(children.length).toBe(3);
    
    const firstLi = children[0] as React.ReactElement;
    expect(firstLi.type).toBe("li");
  });

  test("should start from 1 even if raw markdown starts from non-1 (no continued numbering)", () => {
    const markdown = "5. First item\n6. Second item";
    const elements = renderMarkdown(markdown);
    
    expect(elements.length).toBe(1);
    const ol = elements[0] as React.ReactElement;
    expect(ol.type).toBe("ol");
    expect(ol.props.start).toBeUndefined(); // starts at 1 by default
  });

  test("should render consecutive unordered list items in a single ul", () => {
    const markdown = "- Apple\n- Banana\n- Cherry";
    const elements = renderMarkdown(markdown);
    
    expect(elements.length).toBe(1);
    const ul = elements[0] as React.ReactElement;
    expect(ul.type).toBe("ul");
    
    const children = React.Children.toArray(ul.props.children);
    expect(children.length).toBe(3);
  });

  test("should split lists when interrupted by paragraph and restart numbering at 1", () => {
    const markdown = "1. Item 1\nSome text\n2. Item 2";
    const elements = renderMarkdown(markdown);
    
    // Expect: ol, p, ol
    expect(elements.length).toBe(3);
    expect((elements[0] as React.ReactElement).type).toBe("ol");
    expect((elements[1] as React.ReactElement).type).toBe("p");
    expect((elements[2] as React.ReactElement).type).toBe("ol");
    expect((elements[2] as React.ReactElement).props.start).toBeUndefined(); // starts at 1 by default
  });
});
