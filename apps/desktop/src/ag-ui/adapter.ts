/**
 * AG-UI 协议适配器
 *
 * 将 sidecar 的 AgentEvent 事件流转换为 AG-UI 协议格式。
 * 现有 UI 组件不变，适配器在后台并行运行，为以下目标服务：
 * 1. 状态管理（MESSAGES_SNAPSHOT 用于历史恢复）
 * 2. 为未来的 CopilotKit / Rust sidecar 提供协议契约
 * 3. threadId/runId 追踪
 */
import { EventType } from "@ag-ui/core";
import type { AgentEvent } from "../bridge/types";

// ─── AG-UI 事件类型 ───────────────────────────

export interface AGUIRunStarted {
  type: typeof EventType.RUN_STARTED;
  threadId: string;
  runId: string;
  timestamp: number;
}

export interface AGUIMessagesSnapshot {
  type: typeof EventType.MESSAGES_SNAPSHOT;
  messages: AGUIMessage[];
  timestamp: number;
}

export interface AGUITextMessageStart {
  type: typeof EventType.TEXT_MESSAGE_START;
  messageId: string;
  role: "assistant";
  timestamp: number;
}

export interface AGUITextMessageContent {
  type: typeof EventType.TEXT_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
  timestamp: number;
}

export interface AGUITextMessageEnd {
  type: typeof EventType.TEXT_MESSAGE_END;
  messageId: string;
  timestamp: number;
}

export interface AGUIReasoningStart {
  type: typeof EventType.REASONING_START;
  messageId: string;
  timestamp: number;
}

export interface AGUIReasoningContent {
  type: typeof EventType.REASONING_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
  timestamp: number;
}

export interface AGUIReasoningEnd {
  type: typeof EventType.REASONING_END;
  messageId: string;
  timestamp: number;
}

export interface AGUIToolCallStart {
  type: typeof EventType.TOOL_CALL_START;
  toolCallId: string;
  toolCallName: string;
  args: string;
  timestamp: number;
}

export interface AGUIToolCallResult {
  type: typeof EventType.TOOL_CALL_RESULT;
  toolCallId: string;
  name: string;
  content: string;
  timestamp: number;
}

export interface AGUIToolCallError {
  type: typeof EventType.TOOL_CALL_RESULT;
  toolCallId: string;
  name: string;
  content: string;
  timestamp: number;
}

export interface AGUIStepStarted {
  type: typeof EventType.STEP_STARTED;
  stepName: string;
  timestamp: number;
}

export interface AGUIStepFinished {
  type: typeof EventType.STEP_FINISHED;
  stepName: string;
  timestamp: number;
}

export interface AGUIRunFinished {
  type: typeof EventType.RUN_FINISHED;
  threadId: string;
  runId: string;
  timestamp: number;
}

export interface AGUIRunError {
  type: typeof EventType.RUN_ERROR;
  message: string;
  code?: string;
  timestamp: number;
}

export interface AGUICustomEvent {
  type: typeof EventType.CUSTOM;
  name: string;
  value: any;
  timestamp: number;
}

export type AGUIEvent =
  | AGUIRunStarted
  | AGUIMessagesSnapshot
  | AGUITextMessageStart
  | AGUITextMessageContent
  | AGUITextMessageEnd
  | AGUIReasoningStart
  | AGUIReasoningContent
  | AGUIReasoningEnd
  | AGUIToolCallStart
  | AGUIToolCallResult
  | AGUIToolCallError
  | AGUIStepStarted
  | AGUIStepFinished
  | AGUIRunFinished
  | AGUIRunError
  | AGUICustomEvent;

export interface AGUIMessage {
  id: string;
  role: "assistant" | "reasoning" | "tool" | "user";
  content?: string;
  toolCalls?: AGUIToolData[];
  toolCallId?: string;
  name?: string;
}

export interface AGUIToolData {
  id: string;
  name: string;
  args: string;
  result?: string;
  isError?: boolean;
}

// ─── 适配器 ────────────────────────────────────

export interface AGUIAdapterOptions {
  /** 收到 MESSAGES_SNAPSHOT 的回调 */
  onMessagesSnapshot?: (snapshot: AGUIMessagesSnapshot) => void;
}

export class AGUIEventAdapter {
  private threadId: string;
  private runId: string;
  private stepCounter = 0;
  private messageIdCounter = 0;
  private reasoningMessageId = "";
  private textMessageId = "";
  private messages: AGUIMessage[] = [];
  private hasStarted = false;
  private options: AGUIAdapterOptions;

  constructor(options: AGUIAdapterOptions = {}) {
    this.threadId = crypto.randomUUID();
    this.runId = crypto.randomUUID();
    this.options = options;
  }

  /** 重置适配器状态（新会话） */
  reset(): void {
    this.threadId = crypto.randomUUID();
    this.runId = crypto.randomUUID();
    this.stepCounter = 0;
    this.messageIdCounter = 0;
    this.reasoningMessageId = "";
    this.textMessageId = "";
    this.messages = [];
    this.hasStarted = false;
  }

  /** 获取当前 threadId */
  getThreadId(): string {
    return this.threadId;
  }

  /** 获取当前 runId */
  getRunId(): string {
    return this.runId;
  }

  /** 获取当前消息快照 */
  getMessagesSnapshot(): AGUIMessagesSnapshot {
    return {
      type: EventType.MESSAGES_SNAPSHOT as typeof EventType.MESSAGES_SNAPSHOT,
      messages: [...this.messages],
      timestamp: Date.now(),
    };
  }

  clearMessages(): void {
    this.messages = [];
  }

  /** 记录用户消息到消息树（供 question 回答后同步） */
  addUserMessage(content: string): void {
    const msg: AGUIMessage = {
      id: `msg_user_${this.threadId.slice(0, 8)}_${++this.messageIdCounter}`,
      role: "user",
      content,
    };
    this.messages.push(msg);
  }

  private nextMessageId(): string {
    return `msg_${this.threadId.slice(0, 8)}_${++this.messageIdCounter}`;
  }

  /**
   * 处理一个 sidecar AgentEvent，返回 AG-UI 事件数组。
   * 在首次调用时自动发射 RUN_STARTED。
   */
  process(event: AgentEvent): AGUIEvent[] {
    const result: AGUIEvent[] = [];

    // 首次事件时发射 RUN_STARTED
    if (!this.hasStarted) {
      this.hasStarted = true;
      result.push({
        type: EventType.RUN_STARTED as typeof EventType.RUN_STARTED,
        threadId: this.threadId,
        runId: this.runId,
        timestamp: Date.now(),
      });
    }

    switch (event.type) {
      // ── Reasoning ──
      case "ThinkingStarted":
        this.reasoningMessageId = this.nextMessageId();
        result.push({
          type: EventType.REASONING_START as typeof EventType.REASONING_START,
          messageId: this.reasoningMessageId,
          timestamp: Date.now(),
        });
        this.messages.push({
          id: this.reasoningMessageId,
          role: "reasoning",
        });
        break;

      case "Thinking": {
        const delta = event.payload || "";
        result.push({
          type: EventType.REASONING_MESSAGE_CONTENT as typeof EventType.REASONING_MESSAGE_CONTENT,
          messageId: this.reasoningMessageId,
          delta,
          timestamp: Date.now(),
        });
        // Update accumulated content
        const msg = this.messages.find((m) => m.id === this.reasoningMessageId);
        if (msg) {
          msg.content = (msg.content || "") + delta;
        }
        break;
      }

      case "ThinkingEnded":
        result.push({
          type: EventType.REASONING_END as typeof EventType.REASONING_END,
          messageId: this.reasoningMessageId,
          timestamp: Date.now(),
        });
        break;

      // ── Text ──
      case "TextStarted":
        this.textMessageId = this.nextMessageId();
        result.push({
          type: EventType.TEXT_MESSAGE_START as typeof EventType.TEXT_MESSAGE_START,
          messageId: this.textMessageId,
          role: "assistant",
          timestamp: Date.now(),
        });
        this.messages.push({
          id: this.textMessageId,
          role: "assistant",
        });
        break;

      case "Text": {
        const delta = event.payload || "";
        result.push({
          type: EventType.TEXT_MESSAGE_CONTENT as typeof EventType.TEXT_MESSAGE_CONTENT,
          messageId: this.textMessageId,
          delta,
          timestamp: Date.now(),
        });
        const msg = this.messages.find((m) => m.id === this.textMessageId);
        if (msg) {
          msg.content = (msg.content || "") + delta;
        }
        break;
      }

      case "TextEnded":
        result.push({
          type: EventType.TEXT_MESSAGE_END as typeof EventType.TEXT_MESSAGE_END,
          messageId: this.textMessageId,
          timestamp: Date.now(),
        });
        break;

      // ── Tool ──
      case "ToolCall": {
        const { name, args, call_id: toolCallId } = event.payload as {
          name: string;
          args: string;
          call_id: string;
        };
        result.push({
          type: EventType.TOOL_CALL_START as typeof EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: name,
          args,
          timestamp: Date.now(),
        });
        // Track tool data in messages
        const lastAssistantMsg = [...this.messages]
          .reverse()
          .find((m) => m.role === "assistant");
        if (lastAssistantMsg) {
          if (!lastAssistantMsg.toolCalls) lastAssistantMsg.toolCalls = [];
          lastAssistantMsg.toolCalls.push({
            id: toolCallId,
            name,
            args,
          });
        }
        break;
      }

      case "ToolStarted":
        // AG-UI 没有 TOOL_CALL_STARTED，跳过
        break;

      case "ToolSuccess": {
        const { name: toolName, result: toolResult, call_id: successId } =
          event.payload as { name: string; result: string; call_id: string };
        result.push({
          type: EventType.TOOL_CALL_RESULT as typeof EventType.TOOL_CALL_RESULT,
          toolCallId: successId,
          name: toolName,
          content: toolResult,
          timestamp: Date.now(),
        });
        // Update tool result in messages
        for (const msg of this.messages) {
          if (msg.toolCalls) {
            const tc = msg.toolCalls.find((t) => t.id === successId);
            if (tc) {
              tc.result = toolResult;
            }
          }
        }
        break;
      }

      case "ToolFailed": {
        const { name: errToolName, error: errMsg, call_id: errId } =
          event.payload as { name: string; error: string; call_id: string };
        result.push({
          type: EventType.TOOL_CALL_RESULT as typeof EventType.TOOL_CALL_RESULT,
          toolCallId: errId,
          name: errToolName,
          content: errMsg,
          timestamp: Date.now(),
        });
        for (const msg of this.messages) {
          if (msg.toolCalls) {
            const tc = msg.toolCalls.find((t) => t.id === errId);
            if (tc) {
              tc.result = errMsg;
              tc.isError = true;
            }
          }
        }
        break;
      }

      case "ToolEnded":
        // AG-UI 没有 TOOL_CALL_ENDED（TOOL_CALL_RESULT 已标识结束）
        break;

      // ── Step ──
      case "StepStarted":
        this.stepCounter++;
        result.push({
          type: EventType.STEP_STARTED as typeof EventType.STEP_STARTED,
          stepName: `step_${this.stepCounter}`,
          timestamp: Date.now(),
        });
        break;

      case "StepEnded":
        result.push({
          type: EventType.STEP_FINISHED as typeof EventType.STEP_FINISHED,
          stepName: `step_${this.stepCounter}`,
          timestamp: Date.now(),
        });
        break;

      // ── Usage ──
      case "Usage":
        result.push({
          type: EventType.CUSTOM as typeof EventType.CUSTOM,
          name: "token_usage",
          value: event.payload,
          timestamp: Date.now(),
        });
        break;

      // ── Finished / Error ──
      case "Finished":
        result.push({
          type: EventType.RUN_FINISHED as typeof EventType.RUN_FINISHED,
          threadId: this.threadId,
          runId: this.runId,
          timestamp: Date.now(),
        });
        // 发射消息快照
        const snapshot = this.getMessagesSnapshot();
        result.push(snapshot);
        this.options.onMessagesSnapshot?.(snapshot);
        break;

      case "Error":
        result.push({
          type: EventType.RUN_ERROR as typeof EventType.RUN_ERROR,
          message: event.payload?.message || "Unknown error",
          timestamp: Date.now(),
        });
        break;
    }

    return result;
  }
}
