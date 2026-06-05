import { tauriBridge } from "./tauri";
import { mockBridge } from "./mock";
import { IBridge } from "./types";

// 扩展 Window 接口以支持 Tauri 内部变量检测，避免 TS 类型报错
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/**
 * 检测当前是否处于 Tauri 桌面壳环境中运行
 */
export const isTauriEnv = (): boolean => {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
};

/**
 * 统一网关：门面模式封装底层不同环境的具体实现
 */
export const bridge: IBridge = isTauriEnv() ? tauriBridge : mockBridge;

// 重新导出类型与子模块，方便外部调用
export * from "./types";
