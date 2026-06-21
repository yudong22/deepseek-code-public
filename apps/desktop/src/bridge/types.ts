export interface UpdateResult {
  hasUpdate: boolean;
  version?: string;
  changelog?: string;
}

export interface UpdateStatus {
  status: "checking" | "available" | "downloading" | "downloaded" | "error";
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
   * 下载并安装更新（自动处理下载进度、解压和重启）
   * @param onStatus 状态回调，实时反馈下载进度
   */
  installUpdate(onStatus?: (status: UpdateStatus) => void): Promise<void>;

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


