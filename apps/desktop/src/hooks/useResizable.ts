import React, { useCallback, useRef, useState } from "react";

export type ResizeAnchor = "left" | "right";

export interface UseResizableOptions {
  /** 初始宽度（像素） */
  initial: number;
  /** 最小宽度 */
  min: number;
  /** 最大宽度 */
  max: number;
  /** 拖动方向：
   *  - "right" = 容器靠右，handle 在容器**左侧**（如 RightPanel），drag left 拉宽
   *  - "left"  = 容器靠左，handle 在容器**右侧**（如 LeftSidebar），drag right 拉宽 */
  anchor: ResizeAnchor;
  /** 拖动结束（mouseup）时回调，传出最终宽度。如果提供，hook 不会自己 setState，而是回调给调用方做受控更新。 */
  onCommit?: (finalWidth: number) => void;
}

export interface UseResizableResult {
  /** 当前宽度（已 commit 的稳定值，初次 render 是 initial） */
  width: number;
  /** 容器 inline style（width 像素值或 undefined） */
  widthStyle: React.CSSProperties | undefined;
  /** 拖动中状态（可选用于 UI 反馈，如改变 cursor） */
  isDragging: boolean;
  /** 容器 ref（调用方把 ref 挂在容器上，hook 拖动时直接改它） */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 拖动时挂在 resize handle 上的 onMouseDown */
  onResizeStart: (e: React.MouseEvent) => void;
  /** follower ref（可选）—— 拖动时这个元素宽度也跟随（如 TitleBar 标签栏） */
  followerRef: React.RefObject<HTMLElement | null>;
  setFollowerRef: (el: HTMLElement | null) => void;
}

/**
 * 通用可拖拽宽度 hook。
 *
 * 设计要点（解决 4 个问题）：
 * 1. **卡顿** — 拖动期间直接 ref 操作 DOM，**不**调 setState（绕开 React 整树重渲染）
 * 2. **元素选择 bug** — handleMouseDown 调 preventDefault()，并设 body.userSelect = "none"
 * 3. **layout 抖动** — 容器默认不挂 transition className（拖动期），
 *    widthStyle 提供的 style 在挂载/卸载时才有动画（用 CSS 控制）
 * 4. **rAF 节流** — mousemove 用 requestAnimationFrame 限流到 60fps
 *
 * follower 机制：拖动时如果传了 followerRef，它的 width 也会同步更新（避免 TitleBar 标签栏宽度滞后）
 */
export function useResizable(opts: UseResizableOptions): UseResizableResult {
  const { initial, min, max, anchor } = opts;
  const [width, setWidth] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const followerRef = useRef<HTMLElement | null>(null);
  // 拖动状态用 ref 持有，绕开 React state 避免 re-render
  const dragState = useRef<{
    startX: number;
    startWidth: number;
    rafId: number | null;
    pendingWidth: number | null;
  } | null>(null);

  const clamp = useCallback((w: number) => Math.max(min, Math.min(max, w)), [min, max]);

  const applyWidth = useCallback(
    (newWidth: number) => {
      const el = containerRef.current;
      if (el) el.style.width = `${newWidth}px`;
      const follower = followerRef.current;
      if (follower) follower.style.width = `${newWidth}px`;
    },
    [],
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      // 阻止文本选择（核心：修复拖动时选中页面元素的 bug）
      e.preventDefault();
      e.stopPropagation();
      const el = containerRef.current;
      if (!el) return;
      // 从 DOM 当前宽度启动（避免与 state 不一致）
      const currentWidth = el.getBoundingClientRect().width;
      dragState.current = {
        startX: e.clientX,
        startWidth: currentWidth,
        rafId: null,
        pendingWidth: null,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setIsDragging(true);

      const onMove = (ev: MouseEvent) => {
        const ds = dragState.current;
        if (!ds) return;
        const delta = anchor === "right" ? ds.startX - ev.clientX : ev.clientX - ds.startX;
        const newW = clamp(ds.startWidth + delta);
        ds.pendingWidth = newW;
        // rAF 节流：每帧最多应用一次
        if (ds.rafId === null) {
          ds.rafId = requestAnimationFrame(() => {
            const cur = dragState.current;
            if (!cur) return;
            if (cur.pendingWidth !== null) {
              applyWidth(cur.pendingWidth);
            }
            cur.rafId = null;
          });
        }
      };

      const onUp = () => {
        const ds = dragState.current;
        if (!ds) return;
        if (ds.rafId !== null) {
          cancelAnimationFrame(ds.rafId);
          ds.rafId = null;
        }
        // 计算最终宽度（拖动期间是 DOM 直改，state 可能没变）
        const finalWidth = clamp(ds.pendingWidth ?? ds.startWidth);
        applyWidth(finalWidth);
        setIsDragging(false);
        dragState.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // 受控模式：回调给外部；非受控：内部 setState
        if (opts.onCommit) {
          opts.onCommit(finalWidth);
        } else {
          setWidth(finalWidth);
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, clamp, applyWidth],
  );

  // widthStyle 只在 width state 变化时更新（拖动期间 width 不变，style 不更新）
  const widthStyle: React.CSSProperties = { width: `${width}px` };

  const setFollowerRef = useCallback((el: HTMLElement | null) => {
    followerRef.current = el;
  }, []);

  return {
    width,
    widthStyle,
    isDragging,
    containerRef,
    onResizeStart,
    followerRef,
    setFollowerRef,
  };
}
