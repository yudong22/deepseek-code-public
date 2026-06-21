/**
 * ui-utils 纯函数测试
 * 无外部依赖，无需 mock
 */
import { describe, expect, test } from "bun:test";
import {
  formatDuration,
  truncateArgs,
  renderToolLine,
  spinner,
  renderStatusBar,
  clearStatusBar,
} from "./ui-utils.ts";

describe("formatDuration", () => {
  test("should format < 1000ms as Xms", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(150)).toBe("150ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("should format >= 1000ms as X.Xs", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(3200)).toBe("3.2s");
    expect(formatDuration(99999)).toBe("100.0s");
  });
});

describe("truncateArgs", () => {
  test("should extract command from JSON args", () => {
    const args = JSON.stringify({ command: "git log --oneline -10", cwd: "/tmp" });
    expect(truncateArgs(args)).toBe("git log --oneline -10");
  });

  test("should extract description from JSON args", () => {
    const args = JSON.stringify({ description: "Fix type error in module" });
    expect(truncateArgs(args)).toBe("Fix type error in module");
  });

  test("should extract pattern from JSON args", () => {
    const args = JSON.stringify({ pattern: "*.ts" });
    expect(truncateArgs(args)).toBe("*.ts");
  });

  test("should extract path from JSON args", () => {
    const args = JSON.stringify({ path: "src/main.ts" });
    expect(truncateArgs(args)).toBe("src/main.ts");
  });

  test("should return original string for non-JSON args", () => {
    expect(truncateArgs("hello world")).toBe("hello world");
  });

  test("should truncate strings over maxLen", () => {
    const long = "a".repeat(100);
    const result = truncateArgs(long, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith("...")).toBe(true);
  });

  test("should use default maxLen of 60", () => {
    const long = "a".repeat(100);
    const result = truncateArgs(long);
    expect(result.length).toBe(60);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("renderToolLine", () => {
  test("should render ✓ line with duration", () => {
    const line = renderToolLine("\x1b[32m✓\x1b[0m", "bash", 'git log -10', "0.3s");
    expect(line).toContain("✓");
    expect(line).toContain("bash");
    expect(line).toContain("0.3s");
  });

  test("should render ✗ line with error", () => {
    const line = renderToolLine("\x1b[31m✗\x1b[0m", "read", "", "", "File not found");
    expect(line).toContain("✗");
    expect(line).toContain("read");
    expect(line).toContain("File not found");
  });

  test("should render ◇ line without duration", () => {
    const line = renderToolLine("◇", "write", 'test.txt', "");
    expect(line).toContain("◇");
    expect(line).toContain("write");
    expect(line).toContain("test.txt");
  });

  test("should pad tool name to 8 chars", () => {
    const line = renderToolLine("◇", "bash", "ls", "");
    // Tool name should be padded
    expect(line).toMatch(/◇\s+bash\s{4}/);
  });
});

describe("spinner", () => {
  test("should return cycling frames", () => {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    for (let i = 0; i < frames.length; i++) {
      expect(spinner()).toBe(frames[i]);
    }
  });

  test("should wrap around at end of frame list", () => {
    // Reset by calling 10 times to wrap around
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    for (let i = 0; i < frames.length; i++) spinner();
    // Next frame should be the first one again
    expect(spinner()).toBe(frames[0]);
  });
});

describe("renderStatusBar", () => {
  test("should include step count", () => {
    const bar = renderStatusBar({
      step: 2,
      totalSteps: 5,
      label: "Agent 执行代码开发",
      elapsed: "00:32",
    });
    expect(bar).toContain("步骤 2/5");
    expect(bar).toContain("Agent 执行代码开发");
    expect(bar).toContain("00:32");
  });

  test("should include current tool when provided", () => {
    const bar = renderStatusBar({
      step: 3,
      totalSteps: 5,
      label: "验证",
      currentTool: "bash",
      currentToolDuration: "2.3s",
      elapsed: "01:15",
    });
    expect(bar).toContain("bash");
    expect(bar).toContain("2.3s");
  });

  test("should include model when provided", () => {
    const bar = renderStatusBar({
      step: 1,
      totalSteps: 5,
      label: "初始化",
      model: "deepseek-chat",
      elapsed: "00:05",
    });
    expect(bar).toContain("deepseek-chat");
  });

  test("should render box borders", () => {
    const bar = renderStatusBar({
      step: 1,
      totalSteps: 1,
      label: "完成",
      elapsed: "00:10",
    });
    expect(bar.startsWith("┌─")).toBe(true);
    expect(bar.endsWith("┘")).toBe(true);
  });
});

describe("clearStatusBar", () => {
  test("should emit ANSI escape sequences", () => {
    const result = clearStatusBar(5);
    expect(result).toContain("\x1b[5A");  // Move up 5 lines
    expect(result).toContain("\x1b[J");   // Clear screen
  });

  test("should handle zero lines", () => {
    const result = clearStatusBar(0);
    expect(result).toContain("\x1b[0A");
  });
});
