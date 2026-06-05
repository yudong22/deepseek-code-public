export interface UpdateResult {
  hasUpdate: boolean;
  version?: string;
  changelog?: string;
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
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  // 壳状态模拟字段
  filesChanged?: Array<{ name: string; path: string }>;
  artifacts?: Array<{ name: string; type: string }>;
}

export interface IBridge {
  /**
   * 调用底层的 greet 指令
   * @param name 问候的人名
   */
  greet(name: string): Promise<string>;

  /**
   * 检查应用更新（企业级壳能力扩展占位）
   */
  checkForUpdates(): Promise<UpdateResult>;

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
}

