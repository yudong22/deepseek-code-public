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

// --- 右侧面板 Tab 类型 ---
interface Tab {
  id: string;
  title: string;
  type: string;
  content: string;
  language?: string;
}

// --- 主面板组件，管理所有状态与业务逻辑 ---
function MainDashboard() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");

  // 右侧面板 Tab 状态
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "overview", title: "Overview", type: "overview", content: "" }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("overview");

  // API Key & 模型选择状态
  const [apiKey, setApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("deepseek-v4-flash");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  // 工作区路径（空字符串 = 使用后端默认沙箱目录）
  const [workspacePath, setWorkspacePath] = useState("");
  const [savedWorkspacePath, setSavedWorkspacePath] = useState("");

  // 侧边栏折叠状态
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // Toast 通知状态
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const toastTimeoutRef = useRef<number | null>(null);
  const activeStreamingSessionRef = useRef<string | null>(null);

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
      } catch (err) {
        console.error("Database initialization failed:", err);
      }
    }
    init();
  }, []);

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
  }, [isModelDropdownOpen]);

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
  }, [id]);

  // --- Toast 通知 ---
  function showToast(message: string) {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ visible: true, message });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast({ visible: false, message: "" });
    }, 1800);
  }

  // --- 右侧面板 Tab 操作 ---
  const openTab = (tab: Tab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) {
        return prev;
      }
      const titleIdx = prev.findIndex((t) => t.title === tab.title);
      if (titleIdx > -1) {
        const next = [...prev];
        next[titleIdx] = tab;
        return next;
      }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
    setIsRightSidebarOpen(true);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabId === "overview") return;
    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const last = nextTabs[nextTabs.length - 1];
        setActiveTabId(last ? last.id : "overview");
      }
      return nextTabs;
    });
  };

  // --- API Key 管理 ---
  async function handleSaveApiKey() {
    try {
      if (!apiKey.trim()) {
        showToast("API Key 不能为空");
        return;
      }
      await bridge.saveSetting("deepseek_api_key", apiKey.trim());
      setSavedApiKey(apiKey.trim());

      // 同时保存工作区路径
      if (workspacePath.trim()) {
        await bridge.saveSetting("workspace_path", workspacePath.trim());
        setSavedWorkspacePath(workspacePath.trim());
      } else {
        await bridge.deleteSetting("workspace_path");
        setSavedWorkspacePath("");
      }

      showToast("设置已保存");
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("保存设置失败:", err);
      showToast("保存失败，请重试");
    }
  }

  async function handleClearApiKey() {
    try {
      await bridge.deleteSetting("deepseek_api_key");
      setApiKey("");
      setSavedApiKey(null);
      showToast("API Key 已清除");
    } catch (err) {
      console.error("清除 API Key 失败:", err);
      showToast("清除失败，请重试");
    }
  }

  async function handleClearHistory() {
    try {
      const allSessions = await bridge.getSessions();
      for (const s of allSessions) {
        await bridge.deleteSession(s.id);
      }
      showToast("历史会话已全部清空");
      setIsSettingsOpen(false);
      navigate("/");
      await loadSessions();
    } catch (err) {
      console.error("清空历史会话失败:", err);
      showToast("清空失败，请重试");
    }
  }

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

  // --- 本地命令处理 ---
  async function handleLocalSlashCommand(cmdText: string) {
    const parts = cmdText.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (command === "/help") {
      const helpMsg: Message = {
        id: `local-help-${Date.now()}`,
        sessionId: id || "temp",
        role: "assistant",
        content: [
          "### 💡 可用的本地命令 (Slash Commands)",
          "",
          "- **/help** - 显示此帮助信息",
          "- **/clear** - 清空并重置当前会话的所有聊天历史",
          "- **/settings** - 打开应用设置面板",
          "- **/model <flash|pro>** - 切换使用的 DeepSeek 模型引擎",
          "",
          "*注：本地命令直接在客户端运行，不会发送给 AI，也不会占用 Token 或保存至历史记录中。*"
        ].join("\n"),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, helpMsg]);
    } else if (command === "/settings") {
      setIsSettingsOpen(true);
    } else if (command === "/clear") {
      if (id) {
        try {
          await bridge.deleteSession(id);
          showToast("会话历史已清空");
          navigate("/");
          await loadSessions();
        } catch (err) {
          console.error("清空会话失败:", err);
          showToast("清空会话失败");
        }
      } else {
        setMessages([]);
        showToast("会话已重置");
      }
    } else if (command === "/model") {
      const targetModel = args[0]?.toLowerCase();
      if (targetModel === "pro" || targetModel === "reasoner") {
        setSelectedModel("deepseek-v4-pro");
        showToast("已切换到模型：deepseek-v4-pro");
        const modelMsg: Message = {
          id: `local-model-${Date.now()}`,
          sessionId: id || "temp",
          role: "assistant",
          content: "🔄 **系统提示**：已切换模型为 `deepseek-v4-pro`（逻辑推理增强引擎）。",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, modelMsg]);
      } else if (targetModel === "flash" || targetModel === "chat") {
        setSelectedModel("deepseek-v4-flash");
        showToast("已切换到模型：deepseek-v4-flash");
        const modelMsg: Message = {
          id: `local-model-${Date.now()}`,
          sessionId: id || "temp",
          role: "assistant",
          content: "🔄 **系统提示**：已切换模型为 `deepseek-v4-flash`（低延迟极速引擎）。",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, modelMsg]);
      } else {
        const errorMsg: Message = {
          id: `local-model-err-${Date.now()}`,
          sessionId: id || "temp",
          role: "assistant",
          content: "❌ **错误**：未知的模型。用法：`/model flash` 或 `/model pro`。",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } else {
      const unknownMsg: Message = {
        id: `local-unknown-${Date.now()}`,
        sessionId: id || "temp",
        role: "assistant",
        content: `❌ **未知命令**：\`${command}\`。输入 \`/help\` 查看所有可用命令。`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, unknownMsg]);
    }
  }

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
      currentSessionId = `session-${Date.now()}`;
      const newSession: Session = {
        id: currentSessionId,
        title: userText.length > 25 ? userText.substring(0, 25) + "..." : userText,
        lastMessage: userText,
        updatedAt: new Date().toISOString(),
        projectName: "deepseek-code",
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
      activeStreamingSessionRef.current = currentSessionId;
      const historyMsgs = await bridge.getMessages(currentSessionId);
      const apiMessages = [
        {
          role: "system",
          content: [
            "You are a helpful programming assistant with access to local file system tools.",
            "You have: FileRead, FileWrite, FileEdit, Grep, Glob, and Bash tools.",
            "IMPORTANT: Always use RELATIVE paths (e.g. 'src/main.rs', 'README.md') — never absolute paths like '/Users/...' or 'C:\\...'.",
            "All file operations are sandboxed to the workspace root. Relative paths are automatically resolved within the workspace.",
            "You run autonomously without requiring user approval.",
          ].join(" "),
        },
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
      let currentToolCalls: Array<{ name: string; args: string; result?: string; isError?: boolean }> = [];

      await bridge.runAgent(
        savedApiKey || "",
        selectedModel,
        apiMessages,
        savedWorkspacePath || ".",
        async (event) => {
          if (event.type === "Thinking") {
            currentThinking += event.payload;
            setMessages((prev) => updateAssistantMsg(prev, assistantMsgId, currentContent, currentThinking));
          } else if (event.type === "Text") {
            currentContent += event.payload;
            setMessages((prev) => updateAssistantMsg(prev, assistantMsgId, currentContent, currentThinking));
          } else if (event.type === "ToolCall") {
            const toolName = event.payload.name;
            const toolArgs = event.payload.args;
            // 同步更新本地 mutable 数组（与 currentContent 一样的模式）
            currentToolCalls = [...currentToolCalls, { name: toolName, args: toolArgs }];
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls] };
                return updated;
              }
              return prev;
            });
          } else if (event.type === "ToolResult") {
            const toolName = event.payload.name;
            const toolResult = event.payload.result;
            let isError = false;
            try {
              const parsed = JSON.parse(toolResult);
              if (parsed && (parsed.error !== undefined || parsed.success === false)) {
                isError = true;
              }
            } catch {}

            // 在本地 mutable 数组中找到最后一个同名未完成的工具并填入结果
            const tcIdx = [...currentToolCalls].map((tc, i) => tc.name === toolName && tc.result === undefined ? i : -1).filter(i => i > -1).pop() ?? -1;
            if (tcIdx > -1) {
              currentToolCalls = currentToolCalls.map((tc, i) =>
                i === tcIdx ? { ...tc, result: toolResult, isError } : tc
              );
            }
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], toolCalls: [...currentToolCalls] };
                return updated;
              }
              return prev;
            });
          } else if (event.type === "Error") {
            activeStreamingSessionRef.current = null;
            currentContent += `\n\n❌ **运行出错：** \`${event.payload}\`\n`;
            setMessages((prev) => updateAssistantMsg(prev, assistantMsgId, currentContent, currentThinking));
          } else if (event.type === "Finished") {
            activeStreamingSessionRef.current = null;
            // 直接使用本地 mutable 数组，无需从 React state 读取
            const finalToolCalls = currentToolCalls;

            const finalMsg: Message = {
              id: assistantMsgId,
              sessionId: currentSessionId!,
              role: "assistant",
              content: currentContent,
              createdAt: new Date().toISOString(),
              toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
            };
            if (currentThinking) {
              finalMsg.reasoning_content = currentThinking;
            }
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
      activeStreamingSessionRef.current = null;
      console.error("Agent execution failed:", err);
      showToast(`Agent 执行失败: ${err.message}`);
    }
  }

  const activeSession = sessions.find((s) => s.id === id);

  return (
    <div className="app-container">
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
        tabs={tabs}
        activeTabId={activeTabId}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        onToggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        onNavigate={(delta) => navigate(delta)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onTabClick={setActiveTabId}
        onTabClose={closeTab}
        showToast={showToast}
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
        />

        <main className="middle-panel">
          {id && activeSession ? (
            <>
              <ChatFeed
                messages={messages}
                onOpenTab={openTab}
              />
              <ChatInput
                inputText={inputText}
                selectedModel={selectedModel}
                isModelDropdownOpen={isModelDropdownOpen}
                onInputChange={setInputText}
                onSend={handleSend}
                onToggleModelDropdown={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                onSelectModel={(model) => { setSelectedModel(model); setIsModelDropdownOpen(false); }}
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
            />
          )}
        </main>

        <RightPanel
          isOpen={isRightSidebarOpen}
          tabs={tabs}
          activeTabId={activeTabId}
          messages={messages}
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
  currentThinking: string
): Message[] {
  const idx = prev.findIndex((m) => m.id === assistantMsgId);
  if (idx > -1) {
    const updated = [...prev];
    updated[idx] = {
      ...updated[idx],
      content: currentContent,
      reasoning_content: currentThinking || undefined,
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
        // 为每个工具调用生成唯一的 mock ID（API 规范必填）
        const toolCallsWithId = m.toolCalls!.map((tc, idx) => ({
          id: `call_${m.id}_${idx}`,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.args,
          },
          _result: tc.result || "null",
        }));

        // 写入带 tool_calls 的 assistant 消息
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

        // 紧接着写入 role: tool 消息（匹配 id 和名称）
        for (const tc of toolCallsWithId) {
          result.push({
            role: "tool",
            tool_call_id: tc.id,
            content: tc._result,
          });
        }
      } else {
        // 普通的 assistant 回复
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
