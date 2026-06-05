import React, { useState, useEffect, useRef } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { bridge, Session, Message } from "@/bridge";
import mermaid from "mermaid";
import "./App.css";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
});

function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const id = useRef(`mermaid-${Math.floor(Math.random() * 1000000)}`);

  useEffect(() => {
    let active = true;
    async function renderChart() {
      try {
        const { svg: renderedSvg } = await mermaid.render(id.current, chart);
        if (active) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
      }
    }
    renderChart();
    return () => {
      active = false;
    };
  }, [chart]);

  if (!svg) {
    return (
      <div className="mermaid" id={id.current} style={{ display: "flex", justifyContent: "center", padding: "12px", color: "#8a8a8f", fontSize: "11px" }}>
        Rendering diagram...
      </div>
    );
  }

  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

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
  ),
  RightSidebarToggle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
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
        if (codeBlockLang === "mermaid") {
          elements.push(
            <Mermaid key={`mermaid-${i}`} chart={codeBlockContent.join("\n")} />
          );
        } else {
          elements.push(
            <pre key={`code-${i}`}>
              <code className={codeBlockLang}>{codeBlockContent.join("\n")}</code>
            </pre>
          );
        }
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

  // Right panel tabs state
  const [tabs, setTabs] = useState<Array<{ id: string; title: string; type: string; content: string; language?: string }>>([
    { id: "overview", title: "Overview", type: "overview", content: "" }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("overview");

  const openTab = (tab: { id: string; title: string; type: string; content: string; language?: string }) => {
    setTabs((prev) => {
      if (prev.some(t => t.id === tab.id)) {
        return prev;
      }
      const titleIdx = prev.findIndex(t => t.title === tab.title);
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
      const nextTabs = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const last = nextTabs[nextTabs.length - 1];
        setActiveTabId(last ? last.id : "overview");
      }
      return nextTabs;
    });
  };

  // API Key & Model Selection States
  const [apiKey, setApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("deepseek-v4-flash");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Sidebar fold states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const toastTimeoutRef = useRef<number | null>(null);
  const activeStreamingSessionRef = useRef<string | null>(null);

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
    setTabs([{ id: "overview", title: "Overview", type: "overview", content: "" }]);
    setActiveTabId("overview");
    if (id) {
      if (activeStreamingSessionRef.current === id) {
        // Skip loading from DB because we are currently streaming/handling this session
        return;
      }
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

    // 3. Trigger Agent loop
    try {
      activeStreamingSessionRef.current = currentSessionId;
      const historyMsgs = await bridge.getMessages(currentSessionId);
      const apiMessages = [
        { role: "system", content: "You are a helpful programming assistant. You have access to local file read, write, edit, grep, glob, and bash execution tools. Use them to investigate issues, write code, run commands, and accomplish the task. You run autonomously without requiring user approval." },
        ...historyMsgs.map(m => ({
          role: m.role,
          content: m.content,
          reasoning_content: m.reasoning_content || null
        }))
      ];

      const assistantMsgId = `msg-agent-${Date.now()}`;
      
      // 先插入一条空的 assistant 消息
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

      await bridge.runAgent(
        savedApiKey || "",
        selectedModel,
        apiMessages,
        ".", // 工作区根路径，由后端自动识别 CWD
        async (event) => {
          if (event.type === "Thinking") {
            currentThinking += event.payload;
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  content: currentContent,
                  reasoning_content: currentThinking,
                };
                return updated;
              }
              return prev;
            });
          } else if (event.type === "Text") {
            currentContent += event.payload;
            setMessages((prev) => {
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
            });
          } else if (event.type === "ToolCall") {
            const toolName = event.payload.name;
            const toolArgs = event.payload.args;
            
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                const msg = updated[idx];
                const toolCalls = msg.toolCalls ? [...msg.toolCalls] : [];
                toolCalls.push({ name: toolName, args: toolArgs });
                updated[idx] = {
                  ...msg,
                  toolCalls,
                };
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

            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                const msg = updated[idx];
                const toolCalls = msg.toolCalls ? [...msg.toolCalls] : [];
                const tcIdx = toolCalls.map(tc => tc.name === toolName && tc.result === undefined).lastIndexOf(true);
                if (tcIdx > -1) {
                  toolCalls[tcIdx] = {
                    ...toolCalls[tcIdx],
                    result: toolResult,
                    isError,
                  };
                } else {
                  const lastIdx = toolCalls.findIndex(tc => tc.name === toolName);
                  if (lastIdx > -1) {
                    toolCalls[lastIdx] = {
                      ...toolCalls[lastIdx],
                      result: toolResult,
                      isError,
                    };
                  }
                }
                updated[idx] = {
                  ...msg,
                  toolCalls,
                };
                return updated;
              }
              return prev;
            });
          } else if (event.type === "Error") {
            activeStreamingSessionRef.current = null;
            currentContent += `\n\n❌ **运行出错：** \`${event.payload}\`\n`;
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  content: currentContent,
                };
                return updated;
              }
              return prev;
            });
          } else if (event.type === "Finished") {
            activeStreamingSessionRef.current = null;
            let finalToolCalls: any[] = [];
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              if (idx > -1) {
                finalToolCalls = prev[idx].toolCalls || [];
              }
              return prev;
            });

            // 保存最终消息到本地数据库
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
      {/* Custom Title Bar */}
      <div className="custom-titlebar" data-tauri-drag-region>
        <div className={`titlebar-left ${isLeftSidebarOpen ? "" : "collapsed"}`} data-tauri-drag-region>
          <div className="titlebar-left-controls" data-tauri-drag-region>
            <button className="titlebar-btn" onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}>
              <Icons.SidebarToggle />
            </button>
            <button className="titlebar-btn" onClick={() => navigate(-1)}>
              <Icons.ChevronLeft />
            </button>
            <button className="titlebar-btn" onClick={() => navigate(1)}>
              <Icons.ChevronRight />
            </button>
          </div>
        </div>
        <div className={`titlebar-right ${isLeftSidebarOpen ? "" : "collapsed"}`} data-tauri-drag-region style={{ display: "flex", padding: 0, alignItems: "center" }}>
          {/* Middle part (above middle chat) */}
          <div className="titlebar-middle" data-tauri-drag-region>
            <div className="titlebar-breadcrumbs" data-tauri-drag-region style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span className="titlebar-breadcrumb-session">{activeSession ? activeSession.title : "New Conversation"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "100%" }}>
              {id && activeSession && (
                <button className="titlebar-btn" style={{ background: "#f2f2f7", border: "1px solid #e3e3e3" }} onClick={() => showToast("待开发")}>
                  <Icons.IDE />
                  Open IDE
                </button>
              )}
            </div>
          </div>

          {/* Right part (above right panel, visible only when right sidebar is open) */}
          {id && activeSession && isRightSidebarOpen && (
            <div className="titlebar-right-panel-header" data-tauri-drag-region>
              {/* Tabs Container */}
              <div className="right-panel-tabs">
                {tabs.map((tab, index) => {
                  const isActive = activeTabId === tab.id;
                  
                  // Helper function to get tab icon
                  let tabIcon = null;
                  if (tab.id === "overview") {
                    tabIcon = (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </svg>
                    );
                  } else if (tab.title === "Walkthrough") {
                    tabIcon = (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    );
                  } else if (tab.title.endsWith(".rs")) {
                    tabIcon = (
                      <span className="rust-tab-icon">R</span>
                    );
                  } else {
                    tabIcon = <Icons.FileCode />;
                  }

                  return (
                    <React.Fragment key={tab.id}>
                      {index > 0 && !isActive && activeTabId !== tabs[index - 1].id && (
                        <div className="tab-separator" />
                      )}
                      <div 
                        className={`panel-tab ${isActive ? "active" : ""}`}
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        {tabIcon}
                        <span>{tab.title}</span>
                        {tab.id !== "overview" && (
                          <span 
                            onClick={(e) => closeTab(tab.id, e)} 
                            className="close-tab-btn"
                          >
                            ✕
                          </span>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Action Buttons (Gear & Toggle) */}
              <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0, paddingLeft: "6px" }}>
                <button className="titlebar-btn" onClick={() => setIsSettingsOpen(true)} style={{ padding: "4px" }}>
                  <Icons.Settings />
                </button>
                <button className={`titlebar-btn ${isRightSidebarOpen ? "active" : ""}`} onClick={() => setIsRightSidebarOpen(false)} style={{ padding: "4px" }}>
                  <Icons.RightSidebarToggle />
                </button>
              </div>
            </div>
          )}

          {/* Right Sidebar toggle - When right sidebar is closed, render it in the middle part's actions */}
          {id && activeSession && !isRightSidebarOpen && (
            <div className="titlebar-actions" style={{ paddingRight: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <button className="titlebar-btn" onClick={() => setIsRightSidebarOpen(true)}>
                <Icons.RightSidebarToggle />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="main-layout">
        {/* 1. LEFT SIDEBAR */}
        <aside className={`left-sidebar ${isLeftSidebarOpen ? "" : "collapsed"}`}>

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


            {/* Message stream */}
            <div className="chat-messages-feed">
              {messages.map((msg) => (
                <div key={msg.id} className={`message-wrapper ${msg.role}`}>
                  {msg.role === "user" ? (
                    <div className="message-bubble-user">
                      {msg.content}
                    </div>
                  ) : msg.role === "tool" ? (
                    <div className="message-tool-log" style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      margin: "6px 0",
                      fontSize: "12px",
                      color: "#8a8a8f",
                      background: "rgba(0, 0, 0, 0.02)",
                      borderRadius: "6px",
                      borderLeft: "2px solid #8e8e93"
                    }}>
                      <span style={{ fontSize: "14px" }}>⚙️</span>
                      <span><strong>工具执行完成</strong></span>
                      <details style={{ marginLeft: "auto", cursor: "pointer" }}>
                        <summary style={{ outline: "none", color: "#007aff", fontSize: "11px" }}>查看输出</summary>
                        <pre style={{
                          marginTop: "6px",
                          background: "#f8f8f8",
                          padding: "8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          color: "#333",
                          maxHeight: "200px",
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all"
                        }}>{msg.content}</pre>
                      </details>
                    </div>
                  ) : (
                    <>
                      <div className="message-body">
                        {msg.reasoning_content && (
                          <div className="message-reasoning-block" style={{
                            background: "rgba(0, 0, 0, 0.02)",
                            borderLeft: "3px solid #8e8e93",
                            padding: "8px 12px",
                            marginBottom: "12px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            color: "#555"
                          }}>
                            <div style={{ fontWeight: "600", fontSize: "11px", color: "#8e8e93", marginBottom: "4px" }}>思维链 (Thinking):</div>
                            <div style={{ whiteSpace: "pre-wrap" }}>{msg.reasoning_content}</div>
                          </div>
                        )}
                        {renderMarkdown(msg.content)}

                        {/* Interactive Tool Calls list */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="message-tool-calls-list" style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                            {msg.toolCalls.map((tc, idx) => {
                              let argsPreview = "";
                              try {
                                const parsed = JSON.parse(tc.args);
                                if (parsed.path) {
                                  argsPreview = parsed.path;
                                } else if (parsed.command) {
                                  argsPreview = parsed.command;
                                } else if (parsed.pattern) {
                                  argsPreview = parsed.pattern;
                                } else {
                                  argsPreview = JSON.stringify(parsed);
                                }
                              } catch {
                                argsPreview = tc.args;
                              }
                              
                              // Parse the result dynamically to check for error,
                              // ensuring correctness for historical messages where tc.isError wasn't correctly persisted.
                              let currentIsError = tc.isError;
                              if (tc.result !== undefined && !currentIsError) {
                                try {
                                  const parsed = JSON.parse(tc.result);
                                  if (parsed && (parsed.error !== undefined || parsed.success === false)) {
                                    currentIsError = true;
                                  }
                                } catch {}
                              }

                              const statusIcon = tc.result === undefined 
                                ? "⚙️" 
                                : currentIsError 
                                  ? "❌" 
                                  : "✅";
                                  
                              const statusText = tc.result === undefined 
                                ? "正在执行..." 
                                : currentIsError 
                                  ? "执行失败" 
                                  : "执行完成";

                              return (
                                <div 
                                  key={idx}
                                  className={`tool-call-card ${currentIsError ? "error" : ""}`}
                                  onClick={() => {
                                    if (tc.result !== undefined) {
                                      let language = "json";
                                      let contentToShow = tc.result;
                                      
                                      if (tc.name === "FileRead") {
                                        try {
                                          const parsedRes = JSON.parse(tc.result);
                                          if (parsedRes.content !== undefined) {
                                            contentToShow = parsedRes.content;
                                            const ext = argsPreview.split(".").pop();
                                            language = ext || "text";
                                          }
                                        } catch {}
                                      } else if (tc.name === "Bash") {
                                        try {
                                          const parsedRes = JSON.parse(tc.result);
                                          contentToShow = parsedRes.stdout || parsedRes.stderr || tc.result;
                                          language = "bash";
                                        } catch {}
                                      } else if (tc.name === "Glob" || tc.name === "Grep") {
                                        language = "json";
                                        try {
                                          contentToShow = JSON.stringify(JSON.parse(tc.result), null, 2);
                                        } catch {}
                                      }

                                      let filename = tc.name;
                                      if (tc.name === "FileRead" || tc.name === "FileWrite" || tc.name === "FileEdit") {
                                        filename = argsPreview.split(/[/\\]/).pop() || tc.name;
                                      } else if (tc.name === "Bash") {
                                        filename = argsPreview.length > 12 ? argsPreview.substring(0, 12) + "..." : argsPreview;
                                      } else if (tc.name === "Glob" || tc.name === "Grep") {
                                        filename = `${tc.name}: ${argsPreview.length > 8 ? argsPreview.substring(0, 8) + "..." : argsPreview}`;
                                      }

                                      openTab({
                                        id: `tool-${msg.id}-${idx}`,
                                        title: filename,
                                        type: "tool_result",
                                        content: contentToShow,
                                        language,
                                      });
                                    }
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 12px",
                                    background: "rgba(0, 0, 0, 0.03)",
                                    borderRadius: "6px",
                                    borderLeft: tc.result === undefined 
                                      ? "3px solid #007aff" 
                                      : currentIsError 
                                        ? "3px solid #ff3b30" 
                                        : "3px solid #34c759",
                                    cursor: tc.result !== undefined ? "pointer" : "default",
                                    fontSize: "13px",
                                    transition: "all 0.2s ease"
                                  }}
                                >
                                  <span style={{ fontSize: "16px" }}>{statusIcon}</span>
                                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontWeight: "500" }}>{tc.name} <span style={{ color: "#8a8a8f", fontWeight: "normal", fontFamily: "monospace" }}>({argsPreview})</span></span>
                                    <span style={{ fontSize: "11px", color: "#8a8a8f" }}>{statusText}</span>
                                  </div>
                                  {tc.result !== undefined && (
                                    <span style={{ fontSize: "11px", color: "#007aff" }}>点击在右侧面板查看 ➔</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="message-footer">
                        <span>14:41</span>
                        <button className="message-action-icon"><Icons.Like /></button>
                        <button className="message-action-icon"><Icons.Dislike /></button>
                        <button className="message-action-icon"><Icons.Copy /></button>
                      </div>
                    </>
                  )}
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

      {/* 3. RIGHT SIDEBAR PANEL */}
      <aside className={`right-panel ${isRightSidebarOpen ? "" : "collapsed"}`}>
        {(() => {
          const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
          
          if (activeTab.type === "overview") {
            const assistantMessages = messages.filter((m) => m.role === "assistant");
            const latestAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;
            const rightPanelMarkdownContent = latestAssistantMessage ? latestAssistantMessage.content : "";
            
            if (rightPanelMarkdownContent) {
              return (
                <div className="right-panel-markdown" style={{ height: "100%", boxSizing: "border-box" }}>
                  {renderMarkdown(rightPanelMarkdownContent)}
                </div>
              );
            } else {
              return (
                <div className="right-panel-empty" style={{ height: "100%" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>No document generated yet.</span>
                </div>
              );
            }
          } else if (activeTab.type === "tool_result") {
            return (
              <div className="right-panel-content" style={{ padding: "16px", height: "100%", boxSizing: "border-box", overflow: "hidden" }}>
                <pre style={{
                  margin: 0,
                  padding: "16px",
                  background: "#f6f8fa",
                  borderRadius: "6px",
                  border: "1px solid #d0d7de",
                  overflow: "auto",
                  height: "100%",
                  boxSizing: "border-box",
                  fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                  fontSize: "12px",
                  lineHeight: "1.5",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all"
                }}>
                  <code>{activeTab.content}</code>
                </pre>
              </div>
            );
          }
          return null;
        })()}
      </aside>
      </div>

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
