import React, { useState, useEffect, useRef } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { bridge, Session, Message } from "@/bridge";
import "./App.css";

// --- Inline SVG Icons Helper ---
const Icons = {
  SidebarToggle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Folder: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8a8f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Filter: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  FolderPlus: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  ),
  History: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="16" y2="14" />
    </svg>
  ),
  Tasks: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Mic: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8a8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  Send: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  IDE: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  FileCode: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polyline points="8 13 6 15 8 17" />
      <polyline points="16 13 18 15 16 17" />
      <line x1="13" y1="13" x2="11" y2="17" />
    </svg>
  ),
  Like: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  Dislike: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm12-3h3a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-3" />
    </svg>
  ),
  Copy: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
};

// --- Custom Inline Markdown Renderer ---
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        elements.push(
          <pre key={`code-${i}`}>
            <code className={codeBlockLang}>{codeBlockContent.join("\n")}</code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockLang = line.replace("```", "").trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(<h3 key={`h3-${i}`} style={{ marginTop: "14px", marginBottom: "6px", fontSize: "14px", fontWeight: "600" }}>{parseInlineMarkdown(line.slice(4))}</h3>);
      continue;
    }

    // Bullet lists
    if (line.startsWith("- ")) {
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: "4px 0 6px 20px" }}>
          <li>{parseInlineMarkdown(line.slice(2))}</li>
        </ul>
      );
      continue;
    }

    // Numbered lists
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: "4px 0 6px 20px" }}>
          <li>{parseInlineMarkdown(numMatch[2])}</li>
        </ol>
      );
      continue;
    }

    // Plain text / paragraph
    if (line.trim() !== "") {
      elements.push(<p key={`p-${i}`} style={{ marginBottom: "10px" }}>{parseInlineMarkdown(line)}</p>);
    }
  }

  return elements;
}

// Inline formatting helper
function parseInlineMarkdown(text: string): React.ReactNode[] {
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
        parts.push(
          <a key={index} href={path} className="file-item-left" style={{ display: "inline-flex", alignItems: "center", gap: "3px", margin: "0 2px" }}>
            <Icons.FileCode />
            {title}
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

// --- Main Dashboard Implementation ---
function MainDashboard() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");

  // API Key & Model Selection States
  const [apiKey, setApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("deepseek-v4-flash");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const toastTimeoutRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize DB, load sessions and saved DeepSeek API key
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
      } catch (err) {
        console.error("Database initialization failed:", err);
      }
    }
    init();
  }, []);

  // Click outside model selector to close dropdown
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

  // Load message logs when session ID changes
  useEffect(() => {
    if (id) {
      loadMessages(id);
    } else {
      setMessages([]);
    }
  }, [id]);


  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Trigger Toast Notification
  function showToast(message: string) {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ visible: true, message });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast({ visible: false, message: "" });
    }, 1800);
  }

  async function handleSaveApiKey() {
    try {
      if (!apiKey.trim()) {
        showToast("API Key 不能为空");
        return;
      }
      await bridge.saveSetting("deepseek_api_key", apiKey.trim());
      setSavedApiKey(apiKey.trim());
      showToast("API Key 保存成功");
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("保存 API Key 失败:", err);
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



  // Load sessions from SQLite/localStorage
  async function loadSessions() {
    try {
      const dbSessions = await bridge.getSessions();
      setSessions(dbSessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }

  // Load messages from SQLite/localStorage
  async function loadMessages(sessionId: string) {
    try {
      const dbMsgs = await bridge.getMessages(sessionId);
      setMessages(dbMsgs);
    } catch (error) {
      console.error(`Failed to load messages for session ${sessionId}:`, error);
    }
  }

  // Handle user send prompt
  async function handleSend() {
    if (!inputText.trim()) return;

    const userText = inputText;
    setInputText("");

    let currentSessionId = id;

    // 1. If currently on new conversation page (no id), create a new session
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
      // Navigate to the session route
      navigate(`/chat/s/${currentSessionId}`);
    }

    // 2. Save User message to SQLite/localStorage
    const userMsgId = `msg-user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sessionId: currentSessionId,
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
    };

    await bridge.saveMessage(userMsg);

    // Update session timestamp & last message
    const dbSessions = await bridge.getSessions();
    const currentSession = dbSessions.find((s) => s.id === currentSessionId);
    if (currentSession) {
      currentSession.lastMessage = userText;
      currentSession.updatedAt = new Date().toISOString();
      await bridge.saveSession(currentSession);
    }

    await loadMessages(currentSessionId);
    await loadSessions();

    // 3. Trigger API response or mock response
    if (savedApiKey) {
      try {
        const historyMsgs = await bridge.getMessages(currentSessionId);
        const apiMessages = [
          { role: "system", content: "You are a helpful programming assistant." },
          ...historyMsgs.map(m => ({
            role: m.role,
            content: m.content
          }))
        ];

        const response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${savedApiKey}`
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: apiMessages,
            stream: false
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;
          throw new Error(errorMsg);
        }

        const resData = await response.json();
        const assistantReply = resData.choices?.[0]?.message?.content || "API 返回了空响应。";

        const assistantMsgId = `msg-agent-${Date.now()}`;
        const assistantMsg: Message = {
          id: assistantMsgId,
          sessionId: currentSessionId,
          role: "assistant",
          content: assistantReply,
          createdAt: new Date().toISOString()
        };
        await bridge.saveMessage(assistantMsg);

        if (currentSession) {
          currentSession.lastMessage = assistantReply.substring(0, 30) + (assistantReply.length > 30 ? "..." : "");
          currentSession.updatedAt = new Date().toISOString();
          await bridge.saveSession(currentSession);
        }

        await loadMessages(currentSessionId);
        await loadSessions();
      } catch (err: any) {
        console.error("DeepSeek API request failed:", err);
        showToast(`API 请求失败: ${err.message}`);

        const errReply = `❌ **DeepSeek API 调用失败**

错误原因: \`${err.message}\`

请检查：
1. 您在 **Settings** 中设置的 API Key 是否有效。
2. 网络是否能正常连接到 \`api.deepseek.com\` 域名。
3. 如果是在普通浏览器调试环境中，请确保未被跨域 (CORS) 策略拦截（推荐在原生客户端中测试真实 API，或使用跨域助手）。`;
        
        const assistantMsgId = `msg-agent-${Date.now()}`;
        const assistantMsg: Message = {
          id: assistantMsgId,
          sessionId: currentSessionId,
          role: "assistant",
          content: errReply,
          createdAt: new Date().toISOString()
        };
        await bridge.saveMessage(assistantMsg);

        if (currentSession) {
          currentSession.lastMessage = "API 调用失败...";
          currentSession.updatedAt = new Date().toISOString();
          await bridge.saveSession(currentSession);
        }

        await loadMessages(currentSessionId);
        await loadSessions();
      }
    } else {
      setTimeout(async () => {
        const assistantMsgId = `msg-agent-${Date.now()}`;
        
        let replyContent = `我已收到您的输入："${userText}"。根据您的指令，我已经完成了分析并为您提供底层壳能力的相关输出。`;
        let mockFiles: Array<{ name: string; path: string }> = [];
        let mockArtifacts: Array<{ name: string; type: string }> = [];

        if (userText.toLowerCase().includes("readme") || userText.includes("宪法")) {
          replyContent = `我已为您生成并配置了项目的开发宪法：
          
### 宪法条款更新：
1. 双端测试通过后，自动进行 \`git commit\` 提交。
2. 优先通过 Web 端（Mock 效果）进行调试提速。

已更新 [README.md](file:///Users/yudong22/Documents/deepseek-code/README.md) 并执行了本地测试！`;
          mockFiles = [{ name: "README.md", path: "/Users/yudong22/Documents/deepseek-code" }];
          mockArtifacts = [{ name: "Walkthrough", type: "walkthrough" }];
        } else {
          mockFiles = [
            { name: "App.tsx", path: "src" },
            { name: "route-map.md", path: "docs" }
          ];
          mockArtifacts = [
            { name: "Walkthrough", type: "walkthrough" },
            { name: "Task", type: "task" }
          ];
        }

        const assistantMsg: Message = {
          id: assistantMsgId,
          sessionId: currentSessionId!,
          role: "assistant",
          content: replyContent,
          createdAt: new Date().toISOString(),
          filesChanged: mockFiles,
          artifacts: mockArtifacts,
        };

        await bridge.saveMessage(assistantMsg);

        if (currentSession) {
          currentSession.lastMessage = replyContent.substring(0, 30) + "...";
          currentSession.updatedAt = new Date().toISOString();
          await bridge.saveSession(currentSession);
        }

        await loadMessages(currentSessionId!);
        await loadSessions();
      }, 1000);
    }
  }



  // Active session title details
  const activeSession = sessions.find((s) => s.id === id);

  // Helper to format timestamps dynamically (updatedAt to relative/absolute representation)
  function getSessionTimeLabel(updatedAt: string): string {
    const diffMs = Date.now() - new Date(updatedAt).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  return (
    <div className="app-container">
      {/* Global Toast component */}
      {toast.visible && (
        <div className="toast-container">
          <div className="toast-bubble">
            <span style={{ fontSize: "14px" }}>⚠️</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="settings-modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>Client Settings</h3>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <div className="settings-modal-body">
              <div className="form-group">
                <label>DeepSeek API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your sk-... API Key"
                  className="settings-input"
                />
                <p className="settings-hint">
                  {savedApiKey ? (
                    <span style={{ color: "#34c759", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      ● Active: Web client will query api.deepseek.com directly.
                    </span>
                  ) : (
                    <span style={{ color: "#8e8e93" }}>
                      ○ Inactive: Client queries will fallback to standard Mock responses.
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button className="btn-danger" style={{ background: "#ff3b30", color: "#fff", border: "none", marginRight: "auto" }} onClick={handleClearHistory}>
                Clear History
              </button>
              {savedApiKey && (
                <button className="btn-secondary" onClick={handleClearApiKey}>
                  Clear
                </button>
              )}
              <button className="btn-primary" onClick={handleSaveApiKey}>
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 1. LEFT SIDEBAR */}
      <aside className="left-sidebar">
        {/* Windows titlebar dots */}
        <div className="window-controls">
          <div className="window-dot red" />
          <div className="window-dot yellow" />
          <div className="window-dot green" />
        </div>

        {/* Toolbar navigation */}
        <div className="sidebar-toolbar">
          <button className="sidebar-tool-btn">
            <Icons.SidebarToggle />
          </button>
          <button className="sidebar-tool-btn" onClick={() => navigate(-1)}>
            <Icons.ChevronLeft />
          </button>
          <button className="sidebar-tool-btn" onClick={() => navigate(1)}>
            <Icons.ChevronRight />
          </button>
        </div>

        {/* Action button: New Conversation */}
        <div className="new-conv-btn-container">
          <button className="new-conv-btn" onClick={() => navigate("/")}>
            <Icons.Plus />
            New Conversation
          </button>
        </div>

        {/* Static navigation */}
        <div className="sidebar-nav">
          <div className="nav-item" onClick={() => showToast("待开发")}>
            <Icons.History />
            Conversation History
          </div>
          <div className="nav-item" onClick={() => showToast("待开发")}>
            <Icons.Tasks />
            Scheduled Tasks
          </div>
        </div>

        {/* Sidebar scroll content */}
        <div className="sidebar-scroll">
          {/* Projects section - Clicking triggers Toast */}
          <div className="section-title" onClick={() => showToast("暂未开通")}>
            <span>Projects</span>
            <div className="section-title-tools">
              <Icons.Filter />
              <Icons.FolderPlus />
            </div>
          </div>

          <div style={{ padding: "4px 8px" }}>
            {/* 发布前清空项目文件夹列表 */}
          </div>

          {/* Conversations Section (New) - SQLite dynamic list */}
          <div className="conversations-section">
            <div className="conversations-title">Conversations</div>
            <div className="conversations-list">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`session-link ${id === s.id ? "active" : ""}`}
                  onClick={() => navigate(`/chat/s/${s.id}`)}
                >

                  <span className="session-title-text" style={{ fontWeight: id === s.id ? "500" : "normal" }}>
                    {s.title}
                  </span>
                  <span className="session-time">{getSessionTimeLabel(s.updatedAt)}</span>
                </div>
              ))}
              {sessions.length === 0 && (
                <div style={{ padding: "8px 12px", fontSize: "11px", color: "#8a8a8f" }}>
                  暂无历史会话
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer settings */}
        <div className="sidebar-footer">
          <div className="nav-item" onClick={() => setIsSettingsOpen(true)}>
            <Icons.Settings />
            Settings
          </div>
        </div>

      </aside>

      {/* 2. MIDDLE CHAT PANEL */}
      <main className="middle-panel">
        {id && activeSession ? (
          // Active Chat logs
          <>
            <div className="chat-header">
              <div className="chat-title">
                <span className="chat-title-main">{activeSession.title}</span>
              </div>
              <button className="header-action-btn" onClick={() => showToast("待开发")}>
                <Icons.IDE />
                Open IDE
              </button>
            </div>


            {/* Message stream */}
            <div className="chat-messages-feed">
              {messages.map((msg) => (
                <div key={msg.id} className="message-wrapper">
                  <div className="message-header">
                    <div className={`message-avatar ${msg.role === "assistant" ? "assistant" : ""}`}>
                      {msg.role === "assistant" ? "A" : "U"}
                    </div>
                    <span>{msg.role === "assistant" ? "AI Assistant" : "User"}</span>
                  </div>

                  <div className="message-body">
                    {renderMarkdown(msg.content)}

                    {/* Files changed list */}
                    {msg.filesChanged && msg.filesChanged.length > 0 && (
                      <div className="files-changed-summary">
                        <div className="files-summary-header">
                          <span>Files Changed ({msg.filesChanged.length})</span>
                          <Icons.ChevronDown />
                        </div>
                        <div className="files-summary-list">
                          {msg.filesChanged.map((f, idx) => (
                            <div key={idx} className="file-item-chip">
                              <a href={`file://${f.path}/${f.name}`} className="file-item-left">
                                <Icons.FileCode />
                                {f.name}
                              </a>
                              <span className="file-path-desc">{f.path}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="message-footer">
                    <span>14:41</span>
                    <button className="message-action-icon"><Icons.Like /></button>
                    <button className="message-action-icon"><Icons.Dislike /></button>
                    <button className="message-action-icon"><Icons.Copy /></button>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom active chat input */}
            <div className="active-chat-input-container">
              <div className="active-chat-box">
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <button className="sidebar-tool-btn" style={{ padding: "0 4px" }} onClick={(e) => { e.stopPropagation(); setIsModelDropdownOpen(!isModelDropdownOpen); }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#555" }}>{selectedModel}</span>
                    <Icons.ChevronDown />
                  </button>
                  {isModelDropdownOpen && (
                    <div className="model-dropdown bottom-aligned">
                      <div
                        className={`model-dropdown-item ${selectedModel === "deepseek-v4-flash" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedModel("deepseek-v4-flash");
                          setIsModelDropdownOpen(false);
                        }}
                      >
                        deepseek-v4-flash
                      </div>
                      <div
                        className={`model-dropdown-item ${selectedModel === "deepseek-v4-pro" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedModel("deepseek-v4-pro");
                          setIsModelDropdownOpen(false);
                        }}
                      >
                        deepseek-v4-pro
                      </div>
                    </div>
                  )}
                </div>

                <input
                  className="active-chat-textarea"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask anything, @ to mention, / for actions"
                />
                <button className="sidebar-tool-btn" style={{ color: "#8a8a8f" }}>
                  <Icons.Mic />
                </button>
                <button className="active-chat-send-btn" onClick={handleSend}>
                  <Icons.Send />
                </button>
              </div>
            </div>
          </>
        ) : (
          // Empty State / New Conversation prompt box
          <div className="empty-state-container">
            <div className="empty-state-header">
              <Icons.Folder />
              <span>deepseek-code</span>
              <Icons.ChevronDown />
            </div>

            <div className="centered-prompt-box">
              <textarea
                className="prompt-textarea"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="Ask anything, @ to mention, / for actions"
              />
              <div className="prompt-toolbar">
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <button className="model-selector-pill" onClick={(e) => { e.stopPropagation(); setIsModelDropdownOpen(!isModelDropdownOpen); }}>
                    <span>{selectedModel}</span>
                    <Icons.ChevronDown />
                  </button>
                  {isModelDropdownOpen && (
                    <div className="model-dropdown">
                      <div
                        className={`model-dropdown-item ${selectedModel === "deepseek-v4-flash" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedModel("deepseek-v4-flash");
                          setIsModelDropdownOpen(false);
                        }}
                      >
                        deepseek-v4-flash
                      </div>
                      <div
                        className={`model-dropdown-item ${selectedModel === "deepseek-v4-pro" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedModel("deepseek-v4-pro");
                          setIsModelDropdownOpen(false);
                        }}
                      >
                        deepseek-v4-pro
                      </div>
                    </div>
                  )}
                </div>
                <button className="sidebar-tool-btn" style={{ color: "#8a8a8f" }}>
                  <Icons.Mic />
                </button>
              </div>

            </div>

            <button className="local-indicator-pill">
              <Icons.Settings />
              <span>Local</span>
              <Icons.ChevronDown />
            </button>
          </div>
        )}
      </main>

    </div>
  );
}

// --- Root Component Wrapping HashRouter ---
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
