import React, { useState, useEffect, useRef } from "react";
import { bridge, Session, Message } from "@/bridge";
import { INITIAL_FOLDERS, INITIAL_MESSAGES, ProjectFolder } from "./mockData";
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#8a8a8f" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

// Inline formatting helper (handles bold **, code `, and files links [name](file://))
function parseInlineMarkdown(text: string): React.ReactNode[] {
  // Simple tokenizer for bold and inline code
  const parts: React.ReactNode[] = [];
  let tempText = text;

  // Regexes
  // Bold (**text**)
  // Inline code (`code`)
  // File link ([name](file://path))
  
  // We can do a character level or simple token split to keep it easy
  const tokenRegex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(file:\/\/.*?\))/g;
  const splitParts = tempText.split(tokenRegex);

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

// --- Main Application Component ---
function App() {
  const [folders, setFolders] = useState<ProjectFolder[]>(INITIAL_FOLDERS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>("session-deepseek-1");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [rightPanelTab, setRightPanelTab] = useState<string>("Overview");

  // Track folder expansion state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "deepseek-code": true,
    "imGateway-saas": true,
  });

  // Track files changed and artifacts of the active message
  const [activeFilesChanged, setActiveFilesChanged] = useState<Array<{ name: string; path: string }>>([]);
  const [activeArtifacts, setActiveArtifacts] = useState<Array<{ name: string; type: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize DB and load initial seed data if empty
  useEffect(() => {
    async function init() {
      try {
        await bridge.initDb();
        await loadDatabase();
      } catch (err) {
        console.error("Database initialization failed:", err);
      }
    }
    init();
  }, []);

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load active session messages
  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    } else {
      setMessages([]);
      setActiveFilesChanged([]);
      setActiveArtifacts([]);
    }
  }, [activeSessionId]);

  // Load database sessions and seed if empty
  async function loadDatabase() {
    try {
      const dbSessions = await bridge.getSessions();
      
      if (dbSessions.length === 0) {
        // Seeding database with INITIAL_FOLDERS sessions and messages
        console.log("[Bridge] Database is empty. Seeding initial mockup dataset...");
        for (const folder of INITIAL_FOLDERS) {
          for (const s of folder.sessions) {
            await bridge.saveSession(s);
            const msgs = INITIAL_MESSAGES[s.id] || [];
            for (const m of msgs) {
              await bridge.saveMessage(m);
            }
          }
        }
        // Query again after seeding
        const seededSessions = await bridge.getSessions();
        buildFoldersTree(seededSessions);
      } else {
        buildFoldersTree(dbSessions);
      }
    } catch (error) {
      console.error("Failed to load sessions from database:", error);
    }
  }

  // Group database sessions by project folders
  function buildFoldersTree(dbSessions: Session[]) {
    const updatedFolders = INITIAL_FOLDERS.map((folder) => {
      // Find all database sessions belonging to this folder/project
      const folderSessions = dbSessions.filter((s) => s.projectName === folder.name);
      return {
        ...folder,
        sessions: folderSessions,
      };
    });
    setFolders(updatedFolders);
  }

  // Load messages from SQLite/localStorage for active session
  async function loadMessages(sessionId: string) {
    try {
      const dbMsgs = await bridge.getMessages(sessionId);
      setMessages(dbMsgs);

      // Extract files changed and artifacts from the latest assistant message to populate the right panel
      const lastAssistantMsg = [...dbMsgs].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMsg) {
        setActiveFilesChanged(lastAssistantMsg.filesChanged || []);
        setActiveArtifacts(lastAssistantMsg.artifacts || []);
      } else {
        setActiveFilesChanged([]);
        setActiveArtifacts([]);
      }
    } catch (error) {
      console.error(`Failed to load messages for session ${sessionId}:`, error);
    }
  }

  // Create a new session
  async function createNewSession(projectName: string, initialTitle: string) {
    const newSessionId = `session-${Date.now()}`;
    const newSession: Session = {
      id: newSessionId,
      title: initialTitle.length > 25 ? initialTitle.substring(0, 25) + "..." : initialTitle,
      lastMessage: initialTitle,
      updatedAt: new Date().toISOString(),
      projectName: projectName,
    };

    await bridge.saveSession(newSession);
    await loadDatabase();
    setActiveSessionId(newSessionId);
    return newSessionId;
  }

  // Handle user prompt submission
  async function handleSend() {
    if (!inputText.trim()) return;

    const userText = inputText;
    setInputText("");

    let currentSessionId = activeSessionId;

    // 1. If empty state (no active session), create a new session under deepseek-code first
    if (!currentSessionId) {
      currentSessionId = await createNewSession("deepseek-code", userText);
    }

    // 2. Save and append User message
    const userMsgId = `msg-user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sessionId: currentSessionId,
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
    };

    await bridge.saveMessage(userMsg);
    
    // Update lastMessage and updatedAt for the session
    const sessions = await bridge.getSessions();
    const currentSession = sessions.find((s) => s.id === currentSessionId);
    if (currentSession) {
      currentSession.lastMessage = userText;
      currentSession.updatedAt = new Date().toISOString();
      await bridge.saveSession(currentSession);
    }

    await loadMessages(currentSessionId);
    await loadDatabase();

    // 3. Trigger mock response after a short delay
    setTimeout(async () => {
      const assistantMsgId = `msg-agent-${Date.now()}`;
      
      // Dynamic mock response contents matching the SQLite query
      let replyContent = `I have received your request: "${userText}". Here is the status code report:`;
      let mockFiles: Array<{ name: string; path: string }> = [];
      let mockArtifacts: Array<{ name: string; type: string }> = [];

      if (userText.toLowerCase().includes("readme") || userText.includes("宪法")) {
        replyContent = `我已成功生成项目的 \`README.md\` 并设定了开发宪法规范，同时创建了 \`docs/route-map.md\`。
        
### 修改内容：
- **README.md**：加入了开发宪法规范与安装编译命令说明。
- **route-map.md**：设计并描述了系统前后端架构。

已成功提交基线版本并打上 \`v0.0.1\` 标签。`;
        mockFiles = [
          { name: "README.md", path: "/Users/yudong22/Documents/deepseek-code" },
          { name: "route-map.md", path: "docs" }
        ];
        mockArtifacts = [{ name: "Walkthrough", type: "walkthrough" }];
      } else {
        replyContent = `我已为您处理完成！根据您的要求，对相关的模块进行了分析和编写。
        
### 详细步骤：
1. 分析当前文件夹架构与配置文件。
2. 封装门面对象并重构前端视图。
3. 成功通过了 \`bun run build\` 编译打包验证。`;
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

      // Update session lastMessage
      if (currentSession) {
        currentSession.lastMessage = replyContent.substring(0, 30) + "...";
        currentSession.updatedAt = new Date().toISOString();
        await bridge.saveSession(currentSession);
      }

      await loadMessages(currentSessionId!);
      await loadDatabase();
    }, 1000);
  }

  // Toggle Folder Collapsing
  function toggleFolder(folderName: string) {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  }

  // Active session title
  const activeSession = folders
    .flatMap((f) => f.sessions)
    .find((s) => s.id === activeSessionId);

  return (
    <div className="app-container">
      {/* 1. LEFT SIDEBAR */}
      <aside className="left-sidebar">
        {/* Windows titlebar circles */}
        <div className="window-controls">
          <div className="window-dot red" />
          <div className="window-dot yellow" />
          <div className="window-dot green" />
        </div>

        {/* Toolbar */}
        <div className="sidebar-toolbar">
          <button className="sidebar-tool-btn">
            <Icons.SidebarToggle />
          </button>
          <button className="sidebar-tool-btn">
            <Icons.ChevronLeft />
          </button>
          <button className="sidebar-tool-btn">
            <Icons.ChevronRight />
          </button>
        </div>

        {/* Action: New Conversation Button */}
        <div className="new-conv-btn-container">
          <button className="new-conv-btn" onClick={() => setActiveSessionId(null)}>
            <Icons.Plus />
            New Conversation
          </button>
        </div>

        {/* Static Navigation Items */}
        <div className="sidebar-nav">
          <div className={`nav-item ${!activeSessionId ? "active" : ""}`} onClick={() => setActiveSessionId(null)}>
            <Icons.History />
            Conversation History
          </div>
          <div className="nav-item">
            <Icons.Tasks />
            Scheduled Tasks
          </div>
        </div>

        {/* Dynamic Project Folders Tree */}
        <div className="sidebar-scroll">
          <div className="section-title">
            <span>Projects</span>
            <div className="section-title-tools">
              <Icons.Filter />
              <Icons.FolderPlus />
            </div>
          </div>

          <div style={{ padding: "4px 8px" }}>
            {folders.map((folder) => {
              const isExpanded = expandedFolders[folder.name];
              return (
                <div key={folder.name} className="folder-item">
                  <div className="folder-header" onClick={() => toggleFolder(folder.name)}>
                    <span style={{ display: "inline-flex", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
                      <Icons.ChevronDown />
                    </span>
                    <Icons.Folder />
                    <span style={{ fontSize: "12px", color: "#3a3a3c" }}>{folder.name}</span>
                  </div>

                  {isExpanded && (
                    <div className="folder-sessions">
                      {folder.sessions.map((s) => (
                        <div
                          key={s.id}
                          className={`session-link ${activeSessionId === s.id ? "active" : ""}`}
                          onClick={() => setActiveSessionId(s.id)}
                        >
                          {/* Active Blue dot for GATEWAY-1 active mockup session */}
                          {s.id === "session-gateway-1" && <span className="active-dot" />}
                          <span className="session-title-text">{s.title}</span>
                          <span className="session-time">
                            {s.id === "session-deepseek-1" ? "5m" : "14d"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Settings */}
        <div className="sidebar-footer">
          <div className="nav-item">
            <Icons.Settings />
            Settings
          </div>
        </div>
      </aside>

      {/* 2. MIDDLE CHAT PANEL */}
      <main className="middle-panel">
        {activeSessionId && activeSession ? (
          // Active Chat view
          <>
            <div className="chat-header">
              <div className="chat-title">
                <span>{activeSession.projectName}</span>
                <span>/</span>
                <span className="chat-title-main">{activeSession.title}</span>
              </div>
              <button className="header-action-btn">
                <Icons.IDE />
                Open IDE
              </button>
            </div>

            {/* Chat message feed */}
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

                    {/* Files changed container */}
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
                <button className="sidebar-tool-btn" style={{ padding: "0 4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#555" }}>+ Gemini 3.5 Flash (Medium)</span>
                  <Icons.ChevronDown />
                </button>
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
          // Empty state view / New Conversation
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
                <button className="model-selector-pill">
                  <span>+ Gemini 3.5 Flash (Medium)</span>
                  <Icons.ChevronDown />
                </button>
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

      {/* 3. RIGHT SIDEBAR OVERVIEW PANEL (Rendered only during active chat) */}
      {activeSessionId && (
        <aside className="right-panel">
          {/* Panel Tabs */}
          <div className="right-panel-tabs">
            <button
              className={`panel-tab ${rightPanelTab === "Overview" ? "active" : ""}`}
              onClick={() => setRightPanelTab("Overview")}
            >
              Overview
            </button>
            <button
              className={`panel-tab ${rightPanelTab === "Task" ? "active" : ""}`}
              onClick={() => setRightPanelTab("Task")}
            >
              Task
            </button>
            <button className="panel-tab">route-map.md</button>
            <button className="panel-tab">Cargo.toml</button>
            <button className="panel-tab">default.json</button>
          </div>

          {/* Tab Content */}
          <div className="right-panel-content">
            {rightPanelTab === "Overview" ? (
              <>
                {/* Subagents */}
                <div className="panel-section">
                  <div className="panel-section-header">
                    <span>Subagents</span>
                    <span>0 &gt;</span>
                  </div>
                </div>

                {/* Files Changed */}
                <div className="panel-section">
                  <div className="panel-section-header">
                    <span>Files Changed</span>
                    <span style={{ fontSize: "11px", fontWeight: "normal", color: "#8e8e93" }}>
                      {activeFilesChanged.length} v
                    </span>
                  </div>
                  <div className="panel-section-content">
                    <div className="panel-file-list">
                      {activeFilesChanged.slice(0, 5).map((f, idx) => (
                        <div key={idx} className="panel-file-item">
                          <a href={`file://${f.path}/${f.name}`} className="panel-file-name">
                            <Icons.FileCode />
                            {f.name}
                          </a>
                          <span className="panel-file-path">{f.path.substring(0, 15)}...</span>
                        </div>
                      ))}
                    </div>
                    {activeFilesChanged.length > 5 && (
                      <a href="#see-all" className="see-all-link">
                        See all ({activeFilesChanged.length})
                      </a>
                    )}
                  </div>
                </div>

                {/* Artifacts */}
                <div className="panel-section">
                  <div className="panel-section-header">
                    <span>Artifacts</span>
                    <span style={{ fontSize: "11px", fontWeight: "normal", color: "#8e8e93" }}>
                      {activeArtifacts.length} v
                    </span>
                  </div>
                  <div className="panel-section-content">
                    {activeArtifacts.map((art, idx) => (
                      <div key={idx} className="checklist-item">
                        <input type="checkbox" className="checklist-checkbox" defaultChecked />
                        <span>{art.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Background Tasks */}
                <div className="panel-section" style={{ borderBottom: "none" }}>
                  <div className="panel-section-header">
                    <span>Background Tasks</span>
                    <span>0 &gt;</span>
                  </div>
                </div>
              </>
            ) : (
              // Task Tab Content
              <div className="panel-section-content">
                <div className="checklist-item">
                  <input type="checkbox" className="checklist-checkbox" defaultChecked />
                  <span>Configure SQLite in Tauri Backend</span>
                </div>
                <div className="checklist-item">
                  <input type="checkbox" className="checklist-checkbox" defaultChecked />
                  <span>Install Frontend SQL Plugin Package</span>
                </div>
                <div className="checklist-item">
                  <input type="checkbox" className="checklist-checkbox" defaultChecked />
                  <span>Extend Bridge Facade Layer</span>
                </div>
                <div className="checklist-item">
                  <input type="checkbox" className="checklist-checkbox" defaultChecked />
                  <span>Verify SQLite execution in Tauri dev shell</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;
