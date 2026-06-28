import { useState, useEffect, useRef } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import { bridge, Session, Message } from "@/bridge";
import "./App.css";

import { AppShell } from "@/components/layout/AppShell";
import HistoryPage from "@/components/HistoryPage";
import TasksPage from "@/components/TasksPage";
import TitleBar from "@/components/TitleBar";
import LeftSidebar from "@/components/LeftSidebar";
import RightPanel from "@/components/RightPanel";
import ChatFeed from "@/components/ChatFeed";
import ChatInput from "@/components/ChatInput";
import { fileBaseName } from "@/components/toolUtils";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";

import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { useProjects } from "@/hooks/useProjects";
import { useRightPanelTabs } from "@/hooks/useRightPanelTabs";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useLocalCommands } from "@/hooks/useLocalCommands";
import { useAppUpdates } from "@/hooks/useAppUpdates";
import { AGUIEventAdapter } from "@/ag-ui";

// --- 主面板组件，管理所有状态与业务逻辑 ---
function MainDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isHistoryPage = location.pathname === "/history";
  const isTasksPage = location.pathname === "/tasks";

  const customNavigate = (path: string | number) => {
    if (typeof path === "number") {
      navigate(path);
    } else {
      navigate(path);
    }
  };

  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");

  const [activeTabId, setActiveTabId] = useState<string>("overview");

  // 侧边栏折叠状态
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // 夜间模式
  const [isNightMode, setIsNightMode] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, "like" | "dislike" | null>>({});
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState<string | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

  // 左侧/右侧面板默认宽度（v0.5.14：固定默认值）
  const [rightPanelWidth, setRightPanelWidth] = useState(600);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(260);
  /** LeftSidebar 拖动状态（用于 TitleBar 镜像时去掉 width transition） */
  const [isLeftSidebarDragging, setIsLeftSidebarDragging] = useState(false);
  /** RightPanel 拖动状态（用于 TitleBar 标签栏镜像时去掉 width transition） */
  const [isRightSidebarDragging, setIsRightSidebarDragging] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const activeStreamingSessionRef = useRef<string | null>(null);
  const aguiAdapterRef = useRef<AGUIEventAdapter | null>(null);
  /** Debounced 保存 streaming assistant message 的 timer */
  const saveDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 确保 init()（initDb + checkForUpdates）只执行一次，防止 StrictMode 双调用或 effect 重跑 */
  const initRanRef = useRef(false);
  /** Ref to hold latest streaming state vars (avoid stale closures in visibility handler) */
  const streamStateRef = useRef<{
    assistantMsgId: string; currentContent: string; currentThinking: string;
    currentToolCalls: any[]; sections: any[]; sessionId: string;
  } | null>(null);

  // 交互式问答：agent 提问时暂存的问题
  const [pendingQuestion, setPendingQuestion] = useState<{ args: string; callId: string } | null>(null);
  // 安全确认：bash 危险命令拦截后的 PolicyConfirm 弹窗
  const [pendingPolicyConfirm, setPendingPolicyConfirm] = useState<{
    callId: string;
    command: string;
    pattern: string;
    severity: string;
  } | null>(null);
  /** 追踪最新的 assistant message（含 toolCalls 和 sections），用于切换标签页时持久化 */
  const latestAssistantMsgRef = useRef<Message | null>(null);
  useEffect(() => {
    // 不管因为什么原因 messages 更新了，都把最新的 assistant msg 缓存到 ref
    const assistant = [...messages].reverse().find(m => m.role === "assistant");
    if (assistant) latestAssistantMsgRef.current = assistant;
  }, [messages]);

  // --- 1. Toast Notification Hook ---
  const { toasts, showToast, dismissToast } = useToast();

  // --- 2. Settings Management Hook ---
  const {
    apiKey,
    setApiKey,
    savedApiKey,
    setSavedApiKey,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedModel,
    setSelectedModel,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    workspacePath,
    setWorkspacePath,
    savedWorkspacePath,
    setSavedWorkspacePath,
    handleSaveApiKey,
    handleClearApiKey,
    handleClearHistory,
  } = useSettings({
    showToast,
    navigate: customNavigate,
    loadSessions,
  });

  // --- Updater (v0.5.9: Auto background updater) ---
  const {
    updateStatus,
    isUpdateReady,
    isChecking: isCheckingUpdate,
    checkUpdates: handleCheckUpdates,
    restartToUpdate: handleRestartToUpdate,
  } = useAppUpdates(showToast);


  // --- 3. Projects Workspace Hook ---
  const {
    projects,
    setProjects,
    collapsedProjects,
    handleToggleProjectCollapse,
    handleAddProject,
    handleRemoveProject,
    handleSelectProject,
  } = useProjects({
    showToast,
    navigate: customNavigate,
    setWorkspacePath,
    setSavedWorkspacePath,
  });

  // 从项目设置页触发的删除项目（含二次确认弹框）
  const handleDeleteProjectFromSettings = async (projectPath: string) => {
    try {
      const parts = projectPath.split(/[/\\]/);
      const name = parts[parts.length - 1] || projectPath;
      const projectSessions = sessions.filter(s => s.projectName === name);
      const confirmed = window.confirm(
        `确定要删除项目「${name}」吗？\n\n将同时删除该项目的 ${projectSessions.length} 个会话记录，此操作不可撤销。`
      );
      if (!confirmed) return;
      await handleRemoveProject(projectPath);
      // 删除该项目的所有会话
      for (const s of projectSessions) {
        await bridge.deleteSession(s.id);
      }
      setProjectSettingsTarget(null);
      setIsProjectSettingsOpen(false);
      await loadSessions();
      showToast(`已删除项目「${name}」及其 ${projectSessions.length} 个会话`);
    } catch (err) {
      console.error("Failed to delete project:", err);
      showToast("删除项目失败");
    }
  };

  // 计算待删除项目的会话数
  const getProjectSessionCount = (projectPath: string): number => {
    const parts = projectPath.split(/[/\\]/);
    const name = parts[parts.length - 1] || projectPath;
    return sessions.filter(s => s.projectName === name).length;
  };

  // --- 4. Right Panel Tabs Hook ---
  const {
    tabs,
    setTabs,
    openTab,
    closeTab,
    readAndPreviewFile,
  } = useRightPanelTabs({
    setIsRightSidebarOpen,
    activeTabId,
    setActiveTabId,
  });

  // --- 5. Global Keyboard Shortcuts Hook ---
  useKeyboardShortcuts({
    isSettingsOpen,
    setIsSettingsOpen,
    isRightSidebarOpen,
    setIsRightSidebarOpen,
    isLeftSidebarOpen,
    setIsLeftSidebarOpen,
    setTabs,
    setActiveTabId,
    messages,
    showToast,
    navigate: customNavigate,
  });

  // --- 5b. Local Slash Commands Hook ---
  const runLocalCommand = useLocalCommands({
    currentSessionId: id,
    sessions,
    isNightMode,
    appendAssistantMessage: (msg) => setMessages((prev) => [...prev, msg]),
    setIsNightMode,
    setSelectedModel,
    setIsSettingsOpen,
    setPlanMode,
    navigateHome: () => customNavigate("/"),
    ensureSession,
    reloadMessages: loadMessages,
    showToast,
  });

  // --- 初始化：加载数据库、会话、API Key、工作区路径 ---
  useEffect(() => {
    async function init() {
      if (initRanRef.current) return;
      initRanRef.current = true;
      try {
        await bridge.initDb();
        await loadSessions();
        const storedKey = await bridge.getSetting("deepseek_api_key");
        setSavedApiKey(storedKey);
        if (storedKey) {
          setApiKey(storedKey);
        }
        const storedWorkspace = await bridge.getSetting("workspace_path");
        if (storedWorkspace) {
          setWorkspacePath(storedWorkspace);
          setSavedWorkspacePath(storedWorkspace);
        }
        const storedNightMode = await bridge.getSetting("night_mode");
        if (storedNightMode === "1") {
          setIsNightMode(true);
        }
        const storedFeedback = await bridge.getSetting("message_feedback");
        if (storedFeedback) {
          try {
            setMessageFeedback(JSON.parse(storedFeedback));
          } catch (e) {
            console.error("Failed to parse message_feedback:", e);
          }
        }
        const storedProjects = await bridge.getSetting("projects_list");
        if (storedProjects) {
          try {
            setProjects(JSON.parse(storedProjects));
          } catch (e) {
            console.error("Failed to parse projects_list:", e);
          }
        }
      } catch (err) {
        console.error("Database initialization failed:", err);
      }

      // v0.5.9: 发现新版本后，默认后台更新，不弹对话框，直接下载
      handleCheckUpdates(true).catch(() => {});
    }
    init();
  }, [setApiKey, setSavedApiKey, setWorkspacePath, setSavedWorkspacePath, setProjects]);

  // 点击外部关闭模型选择下拉
  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handleClose = () => {
      setIsModelDropdownOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClose);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClose);
    };
  }, [isModelDropdownOpen, setIsModelDropdownOpen]);

  // 切换会话时加载消息
  useEffect(() => {
    setTabs([{ id: "overview", title: "Overview", type: "overview", content: "" }]);
    setActiveTabId("overview");
    if (id) {
      if (activeStreamingSessionRef.current === id) {
        return;
      }
      loadMessages(id);
    } else {
      setMessages([]);
    }
  }, [id, setTabs, setActiveTabId]);

  // 列出工作区文件（用于 @ 自动补全）
  const listFiles = async (): Promise<string[]> => {
    return await bridge.listWorkspaceFiles(200);
  };

  // --- 会话与消息加载 ---
  async function loadSessions() {
    try {
      const dbSessions = await bridge.getSessions();
      setSessions(dbSessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }

  async function loadMessages(sessionId: string) {
    try {
      const dbMsgs = await bridge.getMessages(sessionId);
      setMessages(dbMsgs);
    } catch (error) {
      console.error(`Failed to load messages for session ${sessionId}:`, error);
    }
  }

  // --- 确保有活跃会话（无 session 时自动创建并导航）---
  async function ensureSession(cmdText?: string): Promise<string> {
    if (id) return id;
    const newId = "ses_" + crypto.randomUUID();
    const projName = savedWorkspacePath
      ? savedWorkspacePath.split(/[/\\]/).pop() || ""
      : "";
    await bridge.saveSession({
      id: newId,
      title: cmdText || "New Conversation",
      lastMessage: new Date().toLocaleTimeString("zh-CN"),
      updatedAt: new Date().toISOString(),
      projectName: projName || undefined,
    });
    await loadSessions();
    navigate(`/chat/s/${newId}`);
    return newId;
  }

  // --- 本地命令处理（已抽到 hooks/useLocalCommands.ts）---
  async function handleLocalSlashCommand(cmdText: string) {
    await runLocalCommand(cmdText);
  }

  // --- 取消 Agent 执行 ---
  const handleCancel = async () => {
    if (activeStreamingSessionRef.current !== id) return; // 不是当前 session
    setIsGenerating(false);
    setPendingQuestion(null);
    activeStreamingSessionRef.current = null;
    await bridge.cancelAgent();
  };

  // --- 消息反馈持久化 ---
  const handleFeedbackSave = async (feedback: Record<string, "like" | "dislike" | null>) => {
    setMessageFeedback(feedback);
    bridge.saveSetting("message_feedback", JSON.stringify(feedback)).catch(() => {});
  };

  // --- 发送消息并触发 Agent 循环 ---
  async function handleSend(attachedFiles?: string[]) {
    const userText = inputText.trim();
    if (!userText && (!attachedFiles || attachedFiles.length === 0)) return;

    // contenteditable 提取的文本已包含 @file://path，无需再拼
    // 但若只有 attachedFiles 没有 text（兼容旧路径），则拼接
    const hasInlineRefs = userText.includes("@file://");
    const fullText = hasInlineRefs || !attachedFiles?.length
      ? userText
      : attachedFiles.map((p) => `@file://${p}`).join(" ") + (userText ? " " + userText : "");

    setInputText("");

    if (fullText.startsWith("/")) {
      await handleLocalSlashCommand(fullText);
      return;
    }

    let currentSessionId = id;

    // 1. 新建会话（如需要）
    if (!currentSessionId) {
      let currentProjName = "";
      if (savedWorkspacePath) {
        const parts = savedWorkspacePath.split(/[/\\]/);
        currentProjName = parts[parts.length - 1] || "";
      }

      const titleText = fullText.replace(/@file:\/\/[\S]+/g, "").trim() || (attachedFiles || []).map((p) => fileBaseName(p)).join(", ");
      currentSessionId = crypto.randomUUID();
      const newSession: Session = {
        id: currentSessionId,
        title: titleText.length > 25 ? titleText.substring(0, 25) + "..." : titleText,
        lastMessage: fullText,
        updatedAt: new Date().toISOString(),
        projectName: currentProjName || undefined,
      };
      await bridge.saveSession(newSession);
      navigate(`/chat/s/${currentSessionId}`);
    }

    // 2. 保存用户消息（包含 @file:// 引用）
    const userMsgId = `msg-user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sessionId: currentSessionId,
      role: "user",
      content: fullText,
      createdAt: new Date().toISOString(),
    };
    await bridge.saveMessage(userMsg);

    // 更新会话时间戳
    const dbSessions = await bridge.getSessions();
    const currentSession = dbSessions.find((s) => s.id === currentSessionId);
    if (currentSession) {
      currentSession.lastMessage = fullText;
      currentSession.updatedAt = new Date().toISOString();
      await bridge.saveSession(currentSession);
    }

    await loadMessages(currentSessionId);
    await loadSessions();

    // 3. 触发 Agent 循环
    try {
      setIsGenerating(true);
      setActiveStep(0);
      activeStreamingSessionRef.current = currentSessionId;
      const historyMsgs = await bridge.getMessages(currentSessionId);
      const planSystemPrompt = planMode ? [
        "You are now in **PLAN MODE**. Your ONLY job is to research, analyze, and produce a detailed plan.",
        "You CANNOT create, edit, or write any source files. All write operations are forbidden.",
        "",
        "When the user gives you a requirement, you MUST:",
        "1. Read and explore the relevant files thoroughly",
        "2. Understand the current architecture and code structure",
        "3. Produce a clear, structured plan covering: what to change, which files to modify, and the approach",
        "4. You may output your plan as Markdown or as a structured document",
        "",
        "Your plan should include:",
        "- Files that need to be read or analyzed",
        "- Current behavior vs. desired behavior",
        "- Step-by-step implementation approach",
        "- Potential risks or edge cases",
        "",
        "Available tools: FileRead, Grep, and Glob for code exploration.",
        "When you have completed your analysis, present your plan clearly.",
        "The user will exit plan mode when they are ready to implement the changes.",
      ].join(" ") : [
        "You are a helpful programming assistant with access to local file system tools.",
        "You have: FileRead, FileWrite, FileEdit, Grep, Glob, and Bash tools.",
        "IMPORTANT: Always use RELATIVE paths (e.g. 'src/main.rs', 'README.md') — never absolute paths like '/Users/...' or 'C:\\...'.",
        "All file operations are sandboxed to the workspace root. Relative paths are automatically resolved within the workspace.",
        "You run autonomously without requiring user approval.",
      ].join(" ");

      const apiMessages = [
        { role: "system", content: planSystemPrompt },
        ...expandHistoryMessages(historyMsgs)
      ];

      const assistantMsgId = `msg-agent-${Date.now()}`;
      const initialAssistantMsg: Message = {
        id: assistantMsgId,
        sessionId: currentSessionId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, initialAssistantMsg]);

      let currentContent = "";
      let currentThinking = "";
      let currentStep = 0;
      let sessionStartTime = Date.now();
      // ─── Session Guard：防止切换标签页后旧 session 的事件覆盖新 session ──
      const guardSessionId = currentSessionId; // 闭包捕获当前 session ID
      const isActiveSession = () => activeStreamingSessionRef.current === guardSessionId;
      let totalTokens: { input?: number; output?: number; reasoning?: number } = {};
      /** 按到达顺序记录事件段落 */
      let sections: Array<{
        type: "thinking" | "tools" | "text";
        content?: string;
        toolCalls?: Array<{ name: string; args: string; call_id: string; result?: string; isError?: boolean; executing?: boolean; step?: number }>;
        elapsed?: string;
      }> = [];
      /** 将 currentToolCalls 的最新状态同步 to sections 中 */
      const syncSections = () => {
        if (sections.length === 0) return;
        for (const sec of sections) {
          if (sec.type === "tools" && sec.toolCalls) {
            sec.toolCalls = sec.toolCalls.map(tc => {
              const updated = currentToolCalls.find(ctc => ctc.call_id === tc.call_id);
              return updated || tc;
            });
          }
        }
      };

      // 追踪 call_id 以精确匹配工具事件
      let currentToolCalls: Array<{ name: string; args: string; call_id: string; result?: string; isError?: boolean; executing?: boolean; step?: number }> = [];
      let thinkingStart = 0;

      // ─── 防抖保存草稿：防止切换标签页后消息丢失 ─────────────────
      const saveDraft = () => {
        if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
        saveDraftTimer.current = setTimeout(async () => {
          const finishedSections: Message["sections"] = sections.length > 0 ? sections.map(s => {
            if (s.type === "thinking") return { type: "thinking" as const, content: s.content || "", elapsed: s.elapsed };
            if (s.type === "tools") return { type: "tools" as const, toolCalls: (s.toolCalls || []).map(({ executing: _ex, ...tc }) => tc) };
            return { type: "text" as const, content: s.content || "" };
          }) : undefined;
          const draft: Message = {
            id: assistantMsgId, sessionId: currentSessionId, role: "assistant",
            content: currentContent, createdAt: initialAssistantMsg.createdAt,
            reasoning_content: currentThinking || undefined,
            toolCalls: currentToolCalls.length > 0 ? currentToolCalls.map(({ executing: _ex, ...tc }) => tc) : undefined,
            sections: finishedSections,
          };
          streamStateRef.current = {
            assistantMsgId, currentContent, currentThinking,
            currentToolCalls, sections, sessionId: currentSessionId,
          };
          bridge.saveMessage(draft).catch(() => {});
        }, 2000); // 2s debounce
      };

      // 切换标签页时立即保存
      const onVisibilityChange = () => {
        if (document.hidden && saveDraftTimer.current) {
          clearTimeout(saveDraftTimer.current);
          saveDraft();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      const currentAgentMode = planMode ? "plan" : undefined;
      // 初始化 AG-UI 适配器
      aguiAdapterRef.current = new AGUIEventAdapter({
        onMessagesSnapshot: (snapshot) => {
          // 将 AG-UI 快照持久化到 settings，为 v0.6.0 集成做准备
          bridge.saveSetting("last_agui_snapshot", JSON.stringify(snapshot)).catch(() => {});
        },
      });
      console.log("[AG-UI] Adapter initialized:", {
        threadId: aguiAdapterRef.current.getThreadId(),
        runId: aguiAdapterRef.current.getRunId(),
      });
      await bridge.runAgent(
        savedApiKey || "",
        selectedModel,
        apiMessages,
        savedWorkspacePath || ".",
        currentSessionId!,
        currentAgentMode,
        async (event) => {
          if (!isActiveSession()) return; // 旧 session 事件全部跳过
          // AG-UI 适配器处理（并行记录，不影响现有 UI）
          const aguiEvents = aguiAdapterRef.current?.process(event);
          if (aguiEvents && aguiEvents.length > 0 && event.type !== "Thinking" && event.type !== "Text") {
            console.log("[AG-UI] Events:", aguiEvents.map(e => e.type));
          }
          // ─── 推理块 ─────────────────────────────────────────────────
          if (event.type === "ThinkingStarted") {
            thinkingStart = Date.now();
            sections.push({ type: "thinking", content: "" });
          } else if (event.type === "Thinking") {
            if (sections.length > 0 && sections[sections.length - 1].type === "thinking") {
              sections[sections.length - 1].content = (sections[sections.length - 1].content || "") + event.payload;
              currentThinking = sections.map(s => s.type === "thinking" ? (s.content || "") : "").filter(Boolean).join("\n");
            }
            setMessages((prev) => updateAssistantMsg(prev, assistantMsgId, currentContent, currentThinking, sections));
            saveDraft();
          } else if (event.type === "ThinkingEnded") {
            if (thinkingStart > 0 && sections.length > 0 && sections[sections.length - 1].type === "thinking") {
              const elapsed = (Math.round(((Date.now() - thinkingStart) / 1000) * 2) / 2).toFixed(1);
              sections[sections.length - 1].elapsed = elapsed;
            }
            thinkingStart = 0;
          }
          // ─── 文本块 ─────────────────────────────────────────────────
          else if (event.type === "TextStarted") {
            sections.push({ type: "text", content: "" });
          } else if (event.type === "Text") {
            currentContent += event.payload;
            if (sections.length > 0 && sections[sections.length - 1].type === "text") {
              sections[sections.length - 1].content = (sections[sections.length - 1].content || "") + event.payload;
            } else {
              sections.push({ type: "text", content: event.payload });
            }
            setMessages((prev) => updateAssistantMsg(prev, assistantMsgId, currentContent, currentThinking, sections));
            // Text 块每 2s 保存一次草稿
            saveDraft();
          } else if (event.type === "TextEnded") {
          }
          // ─── 工具调用 ───────────────────────────────────────────────
          else if (event.type === "ToolCall") {
            const toolName = event.payload.name;
            const toolArgs = event.payload.args;
            const callId = event.payload.call_id || "";

            // 交互式提问：由 ChatFeed 中的 QuestionCard 渲染
            if (toolName === "question") {
              setPendingQuestion({ args: toolArgs, callId });
              // 仍添加至 sections 以便展示提问上下文
              currentToolCalls = [...currentToolCalls, { name: toolName, args: toolArgs, call_id: callId, step: currentStep }];
            } else {
              currentToolCalls = [...currentToolCalls, { name: toolName, args: toolArgs, call_id: callId, step: currentStep }];
            }
            if (sections.length === 0 || sections[sections.length - 1].type !== "tools") {
              sections.push({ type: "tools", toolCalls: [] });
            }
            const ts = sections.filter(s => s.type === "tools");
            if (ts.length > 0) ts[ts.length - 1].toolCalls = [...currentToolCalls.filter(tc => {
              return tc.step === currentStep || currentToolCalls.filter(t => t.step === currentStep).length === 0;
            })];
            setMessages((prev) => updateAssistantMsg(prev, assistantMsgId, currentContent, currentThinking, sections));
            saveDraft();
          } else if (event.type === "PolicyConfirm") {
            // 危险命令安全确认 —— 弹出确认框并阻塞等待用户回复 yes/no
            const { call_id, command, pattern, severity } = event.payload;
            setPendingPolicyConfirm({ callId: call_id, command, pattern, severity });
          } else if (event.type === "ToolStarted") {
            const callId = event.payload.call_id || "";
            const execIdx = currentToolCalls.findIndex(tc => tc.call_id === callId && tc.result === undefined);
            if (execIdx > -1) {
              currentToolCalls = currentToolCalls.map((tc, i) =>
                i === execIdx ? { ...tc, executing: true } : tc
              );
              syncSections();
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === assistantMsgId);
                if (idx > -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls], sections: [...sections] };
                  return updated;
                }
                return prev;
              });
            }
          } else if (event.type === "ToolEnded") {
            const callId = event.payload.call_id || "";
            const execIdx = currentToolCalls.findIndex(tc => tc.call_id === callId);
            if (execIdx > -1) {
              currentToolCalls = currentToolCalls.map((tc, i) =>
                i === execIdx ? { ...tc, executing: false } : tc
              );
              syncSections();
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === assistantMsgId);
                if (idx > -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls], sections: [...sections] };
                  return updated;
                }
                return prev;
              });
            }
          }
          // 工具结果：按 call_id 精确匹配
          else if (event.type === "ToolSuccess") {
            const callId = event.payload.call_id || "";
            const tcIdx = currentToolCalls.findIndex(tc => tc.call_id === callId);
            if (tcIdx > -1) {
              currentToolCalls = currentToolCalls.map((tc, i) =>
                i === tcIdx ? { ...tc, result: event.payload.result, isError: false } : tc
              );
              syncSections();
            }
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls], sections: [...sections] };
                return updated;
              }
              return prev;
            });
          } else if (event.type === "ToolFailed") {
            const callId = event.payload.call_id || "";
            const tcIdx = currentToolCalls.findIndex(tc => tc.call_id === callId);
            if (tcIdx > -1) {
              const errorStr = JSON.stringify({ error: event.payload.error });
              currentToolCalls = currentToolCalls.map((tc, i) =>
                i === tcIdx ? { ...tc, result: errorStr, isError: true } : tc
              );
              syncSections();
            }
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls], sections: [...sections] };
                return updated;
              }
              return prev;
            });
          }
          // 向后兼容：旧版 ToolResult
          else if (event.type === "ToolResult") {
            const toolName = event.payload.name;
            const toolResult = event.payload.result;
            let isError = false;
            try {
              const parsed = JSON.parse(toolResult);
              if (parsed && (parsed.error !== undefined || parsed.success === false)) {
                isError = true;
              }
            } catch {}

            const tcIdx = [...currentToolCalls].map((tc, i) => tc.name === toolName && tc.result === undefined ? i : -1).filter(i => i > -1).pop() ?? -1;
            if (tcIdx > -1) {
              currentToolCalls = currentToolCalls.map((tc, i) =>
                i === tcIdx ? { ...tc, result: toolResult, isError } : tc
              );
              syncSections();
            }
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls], sections: [...sections] };
                return updated;
              }
              return prev;
            });
          }
          // Token 用量
          else if (event.type === "Usage") {
            totalTokens = {
              input: event.payload?.tokens_input,
              output: event.payload?.tokens_output,
              reasoning: event.payload?.tokens_reasoning,
            };
          }
          // Step 生命周期
          else if (event.type === "StepStarted") {
            currentStep += 1;
            setActiveStep(currentStep + 1);
          } else if (event.type === "StepEnded") {
          }
          // 错误事件
          else if (event.type === "Error") {
            setIsGenerating(false);
            if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            streamStateRef.current = null;
            activeStreamingSessionRef.current = null;
            currentToolCalls = currentToolCalls.map(tc =>
              tc.result !== undefined ? tc : { ...tc, result: JSON.stringify({ error: "Agent error" }), isError: true }
            );
            const errMsg = typeof event.payload === "string" ? event.payload : (event.payload?.message || "未知错误");
            currentContent += `\n\n❌ **运行出错：** \`${errMsg}\`\n`;

            const elapsed = (Math.round(((Date.now() - sessionStartTime) / 1000) * 2) / 2).toFixed(1);
            const finishedSections: Message["sections"] = sections.length > 0 ? sections.map(s => {
              if (s.type === "thinking") return { type: "thinking" as const, content: s.content || "", elapsed: s.elapsed };
              if (s.type === "tools") return { type: "tools" as const, toolCalls: (s.toolCalls || []).map(({ executing, ...tc }) => tc) };
              return { type: "text" as const, content: s.content || "" };
            }) : undefined;

            const finalMsg: Message = {
              id: assistantMsgId,
              sessionId: currentSessionId!,
              role: "assistant",
              content: currentContent,
              createdAt: initialAssistantMsg.createdAt,
              completedAt: new Date().toISOString(),
              elapsed: elapsed,
              toolCalls: currentToolCalls.length > 0 ? currentToolCalls.map(({ executing, ...tc }) => tc) : undefined,
              sections: finishedSections,
            };
            const allThinking = sections.filter(s => s.type === "thinking").map(s => {
              const c = s.content || "";
              return s.elapsed ? c + `\n⏱ ${s.elapsed}s` : c;
            }).join("\n");
            if (allThinking) finalMsg.reasoning_content = allThinking;

            await bridge.saveMessage(finalMsg);

            if (currentSession) {
              currentSession.lastMessage = currentContent.substring(0, 30) + (currentContent.length > 30 ? "..." : "");
              currentSession.updatedAt = new Date().toISOString();
              await bridge.saveSession(currentSession);
            }

            await loadMessages(currentSessionId!);
            await loadSessions();
          }
          // 完成
          else if (event.type === "Finished") {
            setIsGenerating(false);
            if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            streamStateRef.current = null;
            activeStreamingSessionRef.current = null;
            const finalToolCalls = currentToolCalls.length > 0
              ? currentToolCalls.map(({ executing, ...tc }) => tc)
              : undefined;

            const elapsed = (Math.round(((Date.now() - sessionStartTime) / 1000) * 2) / 2).toFixed(1);
            const statsParts: string[] = [];
            if (totalTokens.input) statsParts.push("\ud83d\udce5 " + totalTokens.input);
            if (totalTokens.output) statsParts.push("\ud83d\udce4 " + totalTokens.output);
            if (totalTokens.reasoning) statsParts.push("\ud83e\udd14 " + totalTokens.reasoning);
            if (statsParts.length > 0) {
              currentContent += "\n\n---\n*" + statsParts.join(" \u00b7 ") + "*";
            }

            const finishedSections: Message["sections"] = sections.length > 0 ? sections.map(s => {
              if (s.type === "thinking") return { type: "thinking" as const, content: s.content || "", elapsed: s.elapsed };
              if (s.type === "tools") return { type: "tools" as const, toolCalls: (s.toolCalls || []).map(({ executing, ...tc }) => tc) };
              return { type: "text" as const, content: s.content || "" };
            }) : undefined;

            if (finishedSections && statsParts.length > 0) {
              const lastTextSec = [...finishedSections].reverse().find(s => s.type === "text");
              if (lastTextSec) {
                lastTextSec.content += "\n\n---\n*" + statsParts.join(" \u00b7 ") + "*";
              } else {
                finishedSections.push({
                  type: "text" as const,
                  content: "\n\n---\n*" + statsParts.join(" \u00b7 ") + "*",
                });
              }
            }

            const finalMsg: Message = {
              id: assistantMsgId,
              sessionId: currentSessionId!,
              role: "assistant",
              content: currentContent,
              createdAt: initialAssistantMsg.createdAt,
              completedAt: new Date().toISOString(),
              elapsed: elapsed,
              toolCalls: finalToolCalls,
              sections: finishedSections,
            };
            const allThinking = sections.filter(s => s.type === "thinking").map(s => {
              const c = s.content || "";
              return s.elapsed ? c + `\n⏱ ${s.elapsed}s` : c;
            }).join("\n");
            if (allThinking) finalMsg.reasoning_content = allThinking;
            if (currentContent.includes("```mermaid")) {
              finalMsg.artifacts = [{ name: "Architecture Diagram", type: "architecture" }];
            }

            await bridge.saveMessage(finalMsg);

            if (currentSession) {
              currentSession.lastMessage = currentContent.substring(0, 30) + (currentContent.length > 30 ? "..." : "");
              currentSession.updatedAt = new Date().toISOString();
              // 自动生成会话标题：若当前标题为默认值或仅为用户输入截断，则用助手回复的第一句替换
              const isDefaultTitle = currentSession.title === "New Conversation" || currentSession.title.endsWith("...");
              if (isDefaultTitle && currentContent.trim()) {
                // 提取助手回复的第一行有意义的文字（跳过代码块、空行）
                const lines = currentContent.split("\n");
                const firstMeaningfulLine = lines.find(l => {
                  const trimmed = l.trim();
                  return trimmed && !trimmed.startsWith("```") && !trimmed.startsWith("---") && trimmed.length > 3;
                });
                if (firstMeaningfulLine) {
                  const cleanTitle = firstMeaningfulLine.replace(/^[*#>\s]+/, "").trim();
                  currentSession.title = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + "…" : cleanTitle;
                }
              }
              await bridge.saveSession(currentSession);
            }

            await loadMessages(currentSessionId!);
            await loadSessions();
          }
        }
      );
    } catch (err: any) {
      setIsGenerating(false);
      activeStreamingSessionRef.current = null;
      console.error("Agent execution failed:", err);
      const errMsg = typeof err === "string" ? err : (err?.message || String(err));
      showToast(`Agent 执行失败: ${errMsg}`);
    }
  }

  const activeSession = sessions.find((s) => s.id === id);

  // 提前计算 projectSettings 弹窗所需的项目会话数（在 AppShell 外部计算避免传函数）
  const projectSessionCount = projectSettingsTarget
    ? getProjectSessionCount(projectSettingsTarget)
    : 0;

  return (
    <AppShell
      isNightMode={isNightMode}
      toasts={toasts}
      dismissToast={dismissToast}
      isSettingsOpen={isSettingsOpen}
      apiKey={apiKey}
      savedApiKey={savedApiKey}
      onSettingsClose={() => setIsSettingsOpen(false)}
      onApiKeyChange={setApiKey}
      onSaveApiKey={handleSaveApiKey}
      onClearApiKey={handleClearApiKey}
      onClearHistory={() => setShowClearHistoryConfirm(true)}
      updateStatus={updateStatus}
      isCheckingUpdate={isCheckingUpdate}
      onCheckUpdates={() => handleCheckUpdates(false)}
      isProjectSettingsOpen={isProjectSettingsOpen}
      projectSettingsTarget={projectSettingsTarget}
      onProjectSettingsClose={() => { setIsProjectSettingsOpen(false); setProjectSettingsTarget(null); }}
      workspacePath={workspacePath}
      onWorkspaceChange={setWorkspacePath}
      projectSessionCount={projectSessionCount}
      onDeleteProject={handleDeleteProjectFromSettings}
      showClearHistoryConfirm={showClearHistoryConfirm}
      onClearHistoryConfirm={() => { setShowClearHistoryConfirm(false); handleClearHistory(); }}
      onClearHistoryCancel={() => setShowClearHistoryConfirm(false)}
    >
      <TitleBar
        isLeftSidebarOpen={isLeftSidebarOpen}
        isRightSidebarOpen={isRightSidebarOpen}
        activeSession={activeSession}
        planMode={planMode}
        isHistoryPage={isHistoryPage}
        isTasksPage={isTasksPage}
        tabs={tabs}
        activeTabId={activeTabId}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        onToggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        onNavigate={(delta) => navigate(delta)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onTabClick={setActiveTabId}
        onTabClose={closeTab}
        isNightMode={isNightMode}
        onToggleNightMode={() => { const nm = !isNightMode; setIsNightMode(nm); bridge.saveSetting("night_mode", nm ? "1" : "0"); }}
        rightPanelWidth={rightPanelWidth}
        leftSidebarWidth={leftSidebarWidth}
        isLeftSidebarDragging={isLeftSidebarDragging}
        isRightSidebarDragging={isRightSidebarDragging}
        isUpdateReady={isUpdateReady}
        onRestartToUpdate={handleRestartToUpdate}
      />

      <div className="flex flex-1 h-[calc(100vh-38px)] overflow-hidden items-stretch relative">
        <LeftSidebar
          isOpen={isLeftSidebarOpen}
          width={leftSidebarWidth}
          onWidthChange={setLeftSidebarWidth}
          onDraggingChange={setIsLeftSidebarDragging}
          sessions={sessions}
          activeSessionId={id}
          onNewConversation={() => navigate("/")}
          onSelectSession={(sessionId) => navigate(`/chat/s/${sessionId}`)}
          onSettingsOpen={() => setIsSettingsOpen(true)}
          onHistoryOpen={() => navigate("/history")}
          onTasksOpen={() => navigate("/tasks")}
          showToast={showToast}
          projects={projects}
          activeWorkspacePath={savedWorkspacePath}
          collapsedProjects={collapsedProjects}
          onToggleProjectCollapse={handleToggleProjectCollapse}
          onAddProject={handleAddProject}
          onOpenSettingsForProject={(projectPath) => { setProjectSettingsTarget(projectPath); setIsProjectSettingsOpen(true); }}
          onSelectProject={handleSelectProject}
        />

        <main className="flex-1 h-full min-w-0 bg-white dark:bg-surface-primary flex flex-col items-stretch transition-[background-color] duration-200 relative">
          {isHistoryPage ? (
            <HistoryPage
              sessions={sessions}
              onNavigate={(sessionId) => navigate(`/chat/s/${sessionId}`)}
              onSessionDeleted={loadSessions}
              showToast={showToast}
            />
          ) : isTasksPage ? (
            <TasksPage
              projects={projects}
              activeWorkspacePath={savedWorkspacePath || ""}
              showToast={showToast}
            />
          ) : id && activeSession ? (
            <>
              <ChatFeed
                messages={messages}
                planMode={planMode}
                onOpenTab={openTab}
                isGenerating={isGenerating}
                activeStep={activeStep}
                onCancelAgent={handleCancel}
                readFile={(path) => bridge.readFile(path)}
                getFileUrl={(path) => bridge.getFileUrl(path)}
                showToast={showToast}
                onPreviewFile={readAndPreviewFile}
                initialFeedback={messageFeedback}
                onFeedbackSave={handleFeedbackSave}
                onAnswerQuestion={async (answer) => {
                  // 将用户的回答作为新消息追加到对话中
                  const userMsg: Message = {
                    id: `msg-user-${Date.now()}`,
                    sessionId: id!,
                    role: "user",
                    content: answer,
                    createdAt: new Date().toISOString(),
                  };
                  setMessages((prev) => [...prev, userMsg]);
                  // 同步到 ag-ui 适配器
                  aguiAdapterRef.current?.addUserMessage(answer);
                  // 同步写入 DB，防止 agent 结束后 loadMessages 丢失
                  await bridge.saveMessage(userMsg);
                  // 同时保存当前的 assistant message（含 question toolCall），
                  // 防止切换标签页后丢失
                  const assistant = latestAssistantMsgRef.current;
                  if (assistant && assistant.elapsed === undefined) {
                    await bridge.saveMessage({
                      ...assistant,
                      completedAt: new Date().toISOString(),
                    });
                  }
                  setPendingQuestion(null);
                }}
              />
              <ChatInput
                inputText={inputText}
                selectedModel={selectedModel}
                isModelDropdownOpen={isModelDropdownOpen}
                isGenerating={isGenerating}
                hasPendingQuestion={!!pendingQuestion}
                planMode={planMode}
                onInputChange={setInputText}
                onSend={handleSend}
                onCancel={handleCancel}
                onToggleModelDropdown={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                onSelectModel={(model) => { setSelectedModel(model); setIsModelDropdownOpen(false); }}
                workspacePath={savedWorkspacePath}
                onListFiles={listFiles}
                onPreviewFile={readAndPreviewFile}
              />
            </>
          ) : (
            <EmptyState
              inputText={inputText}
              selectedModel={selectedModel}
              isModelDropdownOpen={isModelDropdownOpen}
              onInputChange={setInputText}
              onSend={handleSend}
              onToggleModelDropdown={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              onSelectModel={(model) => { setSelectedModel(model); setIsModelDropdownOpen(false); }}
              activeWorkspacePath={savedWorkspacePath}
              projects={projects}
              onSelectProject={handleSelectProject}
              onAddProject={handleAddProject}
              onListFiles={listFiles}
              onPreviewFile={readAndPreviewFile}
            />
          )}
        </main>

        <RightPanel
          isOpen={isRightSidebarOpen}
          tabs={tabs}
          activeTabId={activeTabId}
          messages={messages}
          width={rightPanelWidth}
          onWidthChange={setRightPanelWidth}
          isNightMode={isNightMode}
          onPreviewFile={readAndPreviewFile}
          onIsResizingChange={setIsRightSidebarDragging}
        />
      </div>
      {/* 危险命令安全确认弹窗 */}
      <ConfirmDialog
        open={pendingPolicyConfirm !== null}
        title="危险操作确认"
        message={pendingPolicyConfirm
          ? `Agent 尝试执行一条被安全策略拦截的命令。请确认是否允许执行。`
          : ""}
        confirmLabel="允许执行"
        cancelLabel="取消"
        danger
        onConfirm={() => {
          if (pendingPolicyConfirm) {
            bridge.respondToAgent("yes");
            setPendingPolicyConfirm(null);
          }
        }}
        onCancel={() => {
          if (pendingPolicyConfirm) {
            bridge.respondToAgent("no");
            setPendingPolicyConfirm(null);
          }
        }}
      >
        {/* 高亮显示危险命令 */}
        <div className="bg-zinc-900 dark:bg-black rounded-lg p-3.5 font-mono text-[12px] text-red-400 leading-relaxed overflow-x-auto select-all">
          $ {pendingPolicyConfirm?.command}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            拦截规则: {pendingPolicyConfirm?.pattern}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            严重度: {pendingPolicyConfirm?.severity}
          </span>
        </div>
      </ConfirmDialog>
    </AppShell>
  );
}

/** 更新流式响应中的助手消息 */
function updateAssistantMsg(
  prev: Message[],
  assistantMsgId: string,
  currentContent: string,
  currentThinking: string,
  sections?: Message["sections"]
): Message[] {
  const idx = prev.findIndex((m) => m.id === assistantMsgId);
  if (idx > -1) {
    const updated = [...prev];
    updated[idx] = {
      ...updated[idx],
      content: currentContent,
      reasoning_content: currentThinking || undefined,
      sections: sections && sections.length > 0 ? sections : undefined,
    };
    return updated;
  }
  return prev;
}

/** 展开历史会话消息，为工具调用生成对应的 tool_calls 声明和对应的 tool 角色回复 */
function expandHistoryMessages(historyMsgs: Message[]): any[] {
  const result: any[] = [];
  for (const m of historyMsgs) {
    if (m.role === "user") {
      result.push({
        role: "user",
        content: m.content,
      });
    } else if (m.role === "assistant") {
      const hasTools = m.toolCalls && m.toolCalls.length > 0;
      if (hasTools) {
        const toolCallsWithId = m.toolCalls!.map((tc, idx) => ({
          id: `call_${m.id}_${idx}`,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.args,
          },
          _result: tc.result || "null",
        }));

        result.push({
          role: "assistant",
          content: m.content || null,
          reasoning_content: m.reasoning_content || null,
          tool_calls: toolCallsWithId.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        });

        for (const tc of toolCallsWithId) {
          result.push({
            role: "tool",
            tool_call_id: tc.id,
            content: tc._result,
          });
        }
      } else {
        result.push({
          role: "assistant",
          content: m.content,
          reasoning_content: m.reasoning_content || null,
        });
      }
    }
  }
  return result;
}

// --- 根组件：HashRouter 路由 ---
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainDashboard />} />
        <Route path="/chat/s/:id" element={<MainDashboard />} />
        <Route path="/history" element={<MainDashboard />} />
        <Route path="/tasks" element={<MainDashboard />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
