export interface UpdateResult {
  hasUpdate: boolean;
  version?: string;
  changelog?: string;
}

export interface UpdateStatus {
  status: "checking" | "available" | "downloading" | "downloaded" | "awaiting-confirm" | "error";
  version?: string;
  progress?: number; // 0-100 下载进度
  error?: string;
}

export interface Session {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  projectName?: string; // 所属项目名称，对应 UI 草图中的项目结构
  active?: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool"; // 支持 tool 角色
  content: string;
  createdAt: string;
  completedAt?: string; // 对话完成的时间
  elapsed?: string; // 对话中的执行时间 (s)
  reasoning_content?: string; // 推理思维链字段
  // 壳状态模拟字段
  filesChanged?: Array<{ name: string; path: string }>;
  artifacts?: Array<{ name: string; type: string }>;
  toolCalls?: Array<{ name: string; args: string; call_id?: string; result?: string; isError?: boolean; step?: number }>;
  /** 事件时序分段：按实际到达顺序记录 thinking/tool/text 交替 */
  sections?: Array<{
    type: "thinking" | "tools" | "text" | "step";
    content?: string;
    toolCalls?: Array<{ name: string; args: string; call_id?: string; result?: string; isError?: boolean; step?: number }>;
    step?: number;
    elapsed?: string;
  }>;
}

export interface IBridge {
  /**
   * 调用底层的 greet 指令
   * @param name 问候的人名
   */
  greet(name: string): Promise<string>;

  /**
   * 检查应用更新
   */
  checkForUpdates(): Promise<UpdateResult>;

  /**
   * 第一阶段：检查并下载更新，下载完成后停在 "downloaded" 状态。
   * 不自动 install / relaunch —— 调用方应在收到 "downloaded" 后调用
   * confirmUpdateInstall() 询问用户，再调用 installDownloadedUpdate() 完成安装重启。
   * @param onStatus 状态回调，实时反馈下载进度
   */
  installUpdate(onStatus?: (status: UpdateStatus) => void): Promise<void>;

  /**
   * 弹出原生确认对话框（tauri-plugin-dialog ask()），询问用户是否立即重启应用以应用已下载的更新。
   * 用户选择"立即重启"返回 true；选择"稍后"返回 false。
   * Mock 环境 fallback 到 window.confirm。
   */
  confirmUpdateInstall(version: string): Promise<boolean>;

  /**
   * 第二阶段：执行 install + relaunch。调用前必须先通过 confirmUpdateInstall() 获得用户确认。
   */
  installDownloadedUpdate(): Promise<void>;

  /**
   * 初始化数据库并创建表结构
   */
  initDb(): Promise<void>;

  /**
   * 保存或更新会话列表数据
   */
  saveSession(session: Session): Promise<void>;

  /**
   * 获取所有会话列表
   */
  getSessions(): Promise<Session[]>;

  /**
   * 删除指定会话
   */
  deleteSession(id: string): Promise<void>;

  /**
   * 保存单条会话消息
   */
  saveMessage(message: Message): Promise<void>;

  /**
   * 获取某会话下的所有历史消息
   */
  getMessages(sessionId: string): Promise<Message[]>;

  /**
   * 获取指定的配置项
   */
  getSetting(key: string): Promise<string | null>;

  /**
   * 保存配置项
   */
  saveSetting(key: string, value: string): Promise<void>;

  /**
   * 删除指定的配置项
   */
  deleteSetting(key: string): Promise<void>;

  /**
   * 调起原生文件夹选择器
   */
  selectDirectory(): Promise<string | null>;

  /**
   * 调起带 tools 的 agent 循环
   * @param agentMode 可选 "plan" | undefined — 切换到规划模式（只读不写）
   */
  runAgent(
    apiKey: string,
    model: string,
    messages: any[],
    workspaceRoot: string,
    sessionId: string,
    agentMode: string | undefined,
    onEvent: (event: AgentEvent) => void
  ): Promise<void>;

  /**
   * 列出工作区中的所有文件（递归，返回相对路径）
   */
  listWorkspaceFiles(maxResults?: number): Promise<string[]>;

  /**
   * 读取工作区中指定文件的文本内容
   */
  readFile(relativePath: string): Promise<string>;

  /**
   * 获取文件在 WebView 中可加载的 URL（用于图片等二进制文件预览）
   */
  getFileUrl(relativePath: string): Promise<string>;

  /**
   * 取消当前正在执行的 agent
   */
  cancelAgent(): Promise<void>;

  /**
   * 向正在运行的 agent 发送用户输入（回答 question 工具的问题）
   */
  respondToAgent(answer: string): Promise<void>;

  /**
   * v0.5.8 定时任务 CRUD
   */
  listScheduledTasks(): Promise<ScheduledTask[]>;
  createScheduledTask(task: ScheduledTask): Promise<void>;
  updateScheduledTask(task: ScheduledTask): Promise<void>;
  deleteScheduledTask(id: string): Promise<void>;
  toggleScheduledTask(id: string, enabled: boolean): Promise<void>;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  workspaceRoot: string;
  cronExpr: string;
  intervalSeconds: number;
  nextRunAt: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
}

export interface AgentEvent {
  type: "Thinking" | "ThinkingStarted" | "ThinkingEnded" |
        "Text" | "TextStarted" | "TextEnded" |
        "ToolCall" | "ToolStarted" | "ToolEnded" |
        "ToolSuccess" | "ToolFailed" |
        "ToolResult" |
        "StepStarted" | "StepEnded" |
        "Usage" |
        "Finished" | "Error";
  payload: any;
}


