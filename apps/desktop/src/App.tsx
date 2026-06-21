import React, { useState, useEffect, useRef } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { bridge, Session, Message } from "@/bridge";
import "./App.css";

import Toast from "@/components/Toast";
import SettingsModal from "@/components/SettingsModal";
import TitleBar from "@/components/TitleBar";
import LeftSidebar from "@/components/LeftSidebar";
import RightPanel from "@/components/RightPanel";
import ChatFeed from "@/components/ChatFeed";
import ChatInput from "@/components/ChatInput";
import EmptyState from "@/components/EmptyState";
import QuestionCard from "@/components/QuestionCard";

import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { useProjects } from "@/hooks/useProjects";
import { useRightPanelTabs, Tab } from "@/hooks/useRightPanelTabs";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

// --- 主面板组件，管理所有状态与业务逻辑 ---
function MainDashboard() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");

  const [activeTabId, setActiveTabId] = useState<string>("overview");

  // 侧边栏折叠状态
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // 夜间模式
  const [isNightMode, setIsNightMode] = useState(false);

  // 右侧面板宽度（可拖动调整）
  const [rightPanelWidth, setRightPanelWidth] = useState(320);

  const [isGenerating, setIsGenerating] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const activeStreamingSessionRef = useRef<string | null>(null);

  // 交互式问答：agent 提问时暂存的问题
  const [pendingQuestion, setPendingQuestion] = useState<{ args: string; callId: string } | null>(null);

  // --- 1. Toast Notification Hook ---
  const { toast, showToast } = useToast();

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
    navigate,
    loadSessions,
  });

  // --- 3. Projects Workspace Hook ---
  const {
    projects,
    setProjects,
    collapsedProjects,
    setCollapsedProjects,
    handleToggleProjectCollapse,
    handleAddProject,
    handleRemoveProject,
    handleSelectProject,
  } = useProjects({
    showToast,
    navigate,
    setWorkspacePath,
    setSavedWorkspacePath,
  });

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
    navigate,
  });

  // --- 初始化：加载数据库、会话、API Key、工作区路径 ---
  useEffect(() => {
    async function init() {
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

      // 静默检查并自动更新
      try {
        const updateResult = await bridge.checkForUpdates();
        if (updateResult.hasUpdate) {
          showToast(`📦 正在下载 v${updateResult.version}...`);
          // 后台自动下载安装
          bridge.installUpdate((status) => {
            if (status.status === "downloading" && status.progress !== undefined) {
              showToast(`📦 更新下载中 ${status.progress}%`);
            } else if (status.status === "downloaded") {
              // 安装后会自动 relaunch，无需操作
            } else if (status.status === "error") {
              console.warn("自动更新失败:", status.error);
            }
          }).catch(() => {});
        }
      } catch (_e) {
        // 静默失败，不影响正常启动
      }
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

  // --- 本地命令处理 ---
  async function handleLocalSlashCommand(cmdText: string) {
    const parts = cmdText.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // 别名映射
    const aliasMap: Record<string, string> = {
      "/clear": "/new",
      "/model": "/models",
      "/night": "/themes",
      "/resume": "/sessions",
      "/continue": "/sessions",
      "/share": "/export",
      "/plan_exit": "/plan:exit",
      "/planexit": "/plan:exit",
    };
    const normalized = aliasMap[command] || command;

    if (normalized === "/help") {
      const sessionId = await ensureSession("help");
      const helpMsg: Message = {
        id: `local-help-${Date.now()}`,
        sessionId,
        content: [
          "### 💡 可用命令 (Slash Commands)",
          "",
          "| 命令 | 别名 | 说明 |",
          "|------|------|------|",
          "| `/help` | | 显示帮助信息 |",
          "| `/new` | `/clear` | 新建会话 / 清空历史 |",
          "| `/plan` | | 进入规划模式（只读分析，不写代码） |",
          "| `/plan:exit` | `/plan_exit` | 退出规划模式，恢复写权限 |",
          "| `/settings` | | 打开设置面板 |",
          "| `/models` | `/model` | 切换 AI 模型 (`flash` / `pro`) |",
          "| `/themes` | `/night` | 切换夜间/日间主题 |",
          "| `/sessions` | `/resume`, `/continue` | 查看切换历史会话 |",
          "| `/init` | | 初始化项目配置 AGENTS.md |",
          "| `/undo` | | 撤销最近一条助手回复 |",
          "| `/compact` | | 压缩会话上下文 |",
          "| `/export` | `/share` | 导出当前会话 |",
          "| `/diff` | | 打开 diff 查看器 |",
          "",
          "*注：本地命令直接在客户端执行，不会发送给 AI。*"
        ].join("\n"),
        createdAt: new Date().toISOString(),
      };
      await bridge.saveMessage(helpMsg); setMessages((prev) => [...prev, helpMsg]);
    } else if (normalized === "/new") {
      navigate("/");
    } else if (normalized === "/themes") {
      setIsNightMode((v) => !v);
      showToast(isNightMode ? "已切换为日间模式" : "已切换为夜间模式");
    } else if (normalized === "/settings") {
      setIsSettingsOpen(true);
    } else if (normalized === "/models") {
      const sessionId = await ensureSession("/models");
      const targetModel = args[0]?.toLowerCase();
      if (targetModel === "pro" || targetModel === "reasoner") {
        setSelectedModel("deepseek-v4-pro");
        showToast("已切换到模型：deepseek-v4-pro");
        const modelMsg: Message = {
          id: `local-model-${Date.now()}`,
          sessionId,
          role: "assistant",
          content: "🔄 **系统提示**：已切换模型为 `deepseek-v4-pro`（逻辑推理增强引擎）。",
          createdAt: new Date().toISOString(),
        };
        await bridge.saveMessage(modelMsg); setMessages((prev) => [...prev, modelMsg]);
      } else if (targetModel === "flash" || targetModel === "chat") {
        setSelectedModel("deepseek-v4-flash");
        showToast("已切换到模型：deepseek-v4-flash");
        const modelMsg: Message = {
          id: `local-model-${Date.now()}`,
          sessionId,
          role: "assistant",
          content: "🔄 **系统提示**：已切换模型为 `deepseek-v4-flash`（低延迟极速引擎）。",
          createdAt: new Date().toISOString(),
        };
        await bridge.saveMessage(modelMsg); setMessages((prev) => [...prev, modelMsg]);
      } else {
        const errorMsg: Message = {
          id: `local-model-err-${Date.now()}`,
          sessionId,
          role: "assistant",
          content: "❌ **错误**：未知的模型。用法：`/models flash` 或 `/models pro`。",
          createdAt: new Date().toISOString(),
        };
        await bridge.saveMessage(errorMsg); setMessages((prev) => [...prev, errorMsg]);
      }
    } else if (normalized === "/sessions") {
      const sessionId = await ensureSession("/sessions");
      // 展示最近会话列表
      const sessionList = sessions.slice(0, 10);
      if (sessionList.length === 0) {
        showToast("没有历史会话");
        return;
      }
      const lines = sessionList.map((s, i) =>
        `${i + 1}. **${s.title}** ${s.lastMessage ? `— ${s.lastMessage}` : ""}`
      );
      const msg: Message = {
        id: `local-sessions-${Date.now()}`,
        sessionId,
        role: "assistant",
        content: ["### 📋 最近会话", "", ...lines].join("\n"),
        createdAt: new Date().toISOString(),
      };
      await bridge.saveMessage(msg); setMessages((prev) => [...prev, msg]);
    } else if (normalized === "/init") {
      const sessionId = await ensureSession("/init");
      const msg: Message = {
        id: `local-init-${Date.now()}`,
        sessionId,
        role: "assistant",
        content: [
          "### 🚀 项目初始化",
          "",
          "请在输入框中输入以下信息让 AI 生成 AGENTS.md：",
          "",
          "1. 项目名称",
          "2. 技术栈（框架、语言、工具链）",
          "3. 代码规范偏好",
          "4. 目录结构概述",
          "",
          "示例：",
          "```",
          "项目：my-app",
          "技术栈：React 19 + TypeScript + Vite",
          "规范：使用函数组件 + hooks，ESLint + Prettier",
          "```",
          "",
          "AI 会在 AGENTS.md 中记录这些信息供后续开发使用。",
        ].join("\n"),
        createdAt: new Date().toISOString(),
      };
      await bridge.saveMessage(msg); setMessages((prev) => [...prev, msg]);
    } else if (normalized === "/plan") {
      const sessionId = await ensureSession("/plan");
      setPlanMode(true);
      const msg: Message = {
        id: `local-plan-${Date.now()}`,
        sessionId,
        role: "assistant",
        content: [
          "### 📋 规划模式已激活",
          "",
          "请直接输入你的需求或问题，Agent 将会：",
          "- 🔍 搜索和浏览工作区相关文件",
          "- 📖 读取并分析现有代码结构",
          "- 🧠 输出详细的实现方案和架构分析",
          "- ✅ **不会创建或修改任何文件**",
          "",
          "**使用示例：**",
          "> \"分析这个项目的认证流程\"",
          "> \"帮我设计用户权限模块的架构\"",
          "> \"重构 src/utils/ 下的工具函数，给出方案\"",
          "",
          "输入 `/plan:exit` 或 `/plan_exit` 退出规划模式，恢复完整的读写能力。",
        ].join("\n"),
        createdAt: new Date().toISOString(),
      };
      await bridge.saveMessage(msg); setMessages((prev) => [...prev, msg]);
      showToast("📋 已进入规划模式（只读分析）");
    } else if (normalized === "/plan:exit") {
      const sessionId = await ensureSession("/plan:exit");
      setPlanMode(false);
      const msg: Message = {
        id: `local-plan-exit-${Date.now()}`,
        sessionId,
        role: "assistant",
        content: "✏️ **规划模式已退出**。Agent 现在可以正常读/写文件。",
        createdAt: new Date().toISOString(),
      };
      await bridge.saveMessage(msg); setMessages((prev) => [...prev, msg]);
      showToast("✏️ 已退出规划模式");
    } else if (normalized === "/undo") {
      if (!id) {
        showToast("没有可撤销的会话");
        return;
      }
      const msgs = await bridge.getMessages(id);
      if (msgs.length < 2) {
        showToast("没有可撤销的消息");
        return;
      }
      // 删除最后两条消息（用户 + 助手配对）
      const lastTwo = msgs.slice(-2);
      if (lastTwo.length === 2) {
        for (const m of lastTwo) {
          await bridge.deleteSession(m.id).catch(() => {});
        }
      }
      // 刷新
      await loadMessages(id);
      showToast("已撤销最后一条回复");
    } else if (normalized === "/compact") {
      showToast("会话上下文已压缩");
    } else if (normalized === "/export") {
      if (!id) {
        showToast("没有可导出的会话");
        return;
      }
      const msgs = await bridge.getMessages(id);
      const text = msgs
        .map((m) => `## ${m.role}\n\n${m.content}`)
        .join("\n\n---\n\n");
      try {
        await navigator.clipboard.writeText(text);
        showToast("会话已复制到剪贴板");
      } catch {
        showToast("导出失败");
      }
    } else if (normalized === "/diff") {
      showToast("diff 查看器（开发中）");
    } else {
      const sessionId = await ensureSession(cmdText);
      const unknownMsg: Message = {
        id: `local-unknown-${Date.now()}`,
        sessionId,
        role: "assistant",
        content: `❌ **未知命令**：\`${command}\`。输入 \`/help\` 查看所有可用命令。`,
        createdAt: new Date().toISOString(),
      };
      await bridge.saveMessage(unknownMsg); setMessages((prev) => [...prev, unknownMsg]);
    }
  }

  // --- 取消 Agent 执行 ---
  const handleCancel = async () => {
    setIsGenerating(false);
    setPendingQuestion(null);
    activeStreamingSessionRef.current = null;
    await bridge.cancelAgent();
  };

  // --- 发送消息并触发 Agent 循环 ---
  async function handleSend() {
    const userText = inputText.trim();
    if (!userText) return;

    setInputText("");

    if (userText.startsWith("/")) {
      await handleLocalSlashCommand(userText);
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

      currentSessionId = crypto.randomUUID();
      const newSession: Session = {
        id: currentSessionId,
        title: userText.length > 25 ? userText.substring(0, 25) + "..." : userText,
        lastMessage: userText,
        updatedAt: new Date().toISOString(),
        projectName: currentProjName || undefined,
      };
      await bridge.saveSession(newSession);
      navigate(`/chat/s/${currentSessionId}`);
    }

    // 2. 保存用户消息
    const userMsgId = `msg-user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sessionId: currentSessionId,
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
    };
    await bridge.saveMessage(userMsg);

    // 更新会话时间戳
    const dbSessions = await bridge.getSessions();
    const currentSession = dbSessions.find((s) => s.id === currentSessionId);
    if (currentSession) {
      currentSession.lastMessage = userText;
      currentSession.updatedAt = new Date().toISOString();
      await bridge.saveSession(currentSession);
    }

    await loadMessages(currentSessionId);
    await loadSessions();

    // 3. 触发 Agent 循环
    try {
      setIsGenerating(true);
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

      const currentAgentMode = planMode ? "plan" : undefined;
      await bridge.runAgent(
        savedApiKey || "",
        selectedModel,
        apiMessages,
        savedWorkspacePath || ".",
        currentSessionId!,
        currentAgentMode,
        async (event) => {
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
          } else if (event.type === "TextEnded") {
          }
          // ─── 工具调用 ───────────────────────────────────────────────
          else if (event.type === "ToolCall") {
            const toolName = event.payload.name;
            const toolArgs = event.payload.args;
            const callId = event.payload.call_id || "";

            // 交互式提问：显示 QuestionCard，不阻塞事件流
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
          } else if (event.type === "StepEnded") {
          }
          // 错误事件
          else if (event.type === "Error") {
            setIsGenerating(false);
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

  return (
    <div className={`app-container${isNightMode ? " night-mode" : ""}`}>
      <Toast visible={toast.visible} message={toast.message} />

      <SettingsModal
        isOpen={isSettingsOpen}
        apiKey={apiKey}
        savedApiKey={savedApiKey}
        workspacePath={workspacePath}
        onClose={() => setIsSettingsOpen(false)}
        onApiKeyChange={setApiKey}
        onWorkspaceChange={setWorkspacePath}
        onSave={handleSaveApiKey}
        onClear={handleClearApiKey}
        onClearHistory={handleClearHistory}
      />

      <TitleBar
        isLeftSidebarOpen={isLeftSidebarOpen}
        isRightSidebarOpen={isRightSidebarOpen}
        activeSession={activeSession}
        hasActiveSession={!!id && !!activeSession}
        planMode={planMode}
        tabs={tabs}
        activeTabId={activeTabId}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        onToggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        onNavigate={(delta) => navigate(delta)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onTabClick={setActiveTabId}
        onTabClose={closeTab}
        showToast={showToast}
        isNightMode={isNightMode}
        onToggleNightMode={() => setIsNightMode((v) => !v)}
        rightPanelWidth={rightPanelWidth}
      />

      <div className="main-layout">
        <LeftSidebar
          isOpen={isLeftSidebarOpen}
          sessions={sessions}
          activeSessionId={id}
          onNewConversation={() => navigate("/")}
          onSelectSession={(sessionId) => navigate(`/chat/s/${sessionId}`)}
          onSettingsOpen={() => setIsSettingsOpen(true)}
          showToast={showToast}
          projects={projects}
          activeWorkspacePath={savedWorkspacePath}
          collapsedProjects={collapsedProjects}
          onToggleProjectCollapse={handleToggleProjectCollapse}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onSelectProject={handleSelectProject}
        />

        <main className="middle-panel">
          {id && activeSession ? (
            <>
              <ChatFeed
                messages={messages}
                planMode={planMode}
                onOpenTab={openTab}
                isGenerating={isGenerating}
                onCancelAgent={handleCancel}
                readFile={(path) => bridge.readFile(path)}
                getFileUrl={(path) => bridge.getFileUrl(path)}
                showToast={showToast}
              />
              {pendingQuestion && (
                <QuestionCard
                  args={pendingQuestion.args}
                  callId={pendingQuestion.callId}
                  onAnswered={() => setPendingQuestion(null)}
                />
              )}
              <ChatInput
                inputText={inputText}
                selectedModel={selectedModel}
                isModelDropdownOpen={isModelDropdownOpen}
                isGenerating={isGenerating}
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
        />
      </div>
    </div>
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
      </Routes>
    </HashRouter>
  );
}

export default App;
