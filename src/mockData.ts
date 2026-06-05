import { Session, Message } from "./bridge/types";

export interface ProjectFolder {
  name: string;
  sessions: Session[];
}

export const INITIAL_FOLDERS: ProjectFolder[] = [
  {
    name: "android",
    sessions: [
      {
        id: "session-android-1",
        title: "Initializing Android Comp...",
        lastMessage: "Finished setting up the Android build system configurations.",
        updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14d
        projectName: "android",
      },
    ],
  },
  {
    name: "deepseek-code",
    sessions: [
      {
        id: "session-deepseek-1",
        title: "Initializing and Starting Project",
        lastMessage: "关于变更的详细日志，请参阅更新后的 walkthrough.md...",
        updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m
        projectName: "deepseek-code",
        active: true,
      },
    ],
  },
  {
    name: "im_desktop_2025",
    sessions: [],
  },
  {
    name: "ImBusiness-saas",
    sessions: [
      {
        id: "session-business-1",
        title: "初始化项目文档，介绍组...",
        lastMessage: "已生成基本的技术选型与团队协作规则文档。",
        updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14d
        projectName: "ImBusiness-saas",
      },
      {
        id: "session-business-2",
        title: "Committing Document U...",
        lastMessage: "Updated the saas architectural layout diagram in docs.",
        updatedAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(), // 16d
        projectName: "ImBusiness-saas",
      },
    ],
  },
  {
    name: "ImContactService-saas",
    sessions: [
      {
        id: "session-contact-1",
        title: "Initialize Microservice Pro...",
        lastMessage: "Spring Cloud setup completed with Eureka service registry.",
        updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14d
        projectName: "ImContactService-saas",
      },
    ],
  },
  {
    name: "imGateway-saas",
    sessions: [
      {
        id: "session-gateway-1",
        title: "Update Robot Thread Doc...",
        lastMessage: "Refactored multi-threading handlers for AI message parsing.",
        updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2m, active blue dot in mockup
        projectName: "imGateway-saas",
      },
      {
        id: "session-gateway-2",
        title: "Generating IM Architectu...",
        lastMessage: "Created Mermaid graphs detailing packet route distributions.",
        updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14d
        projectName: "imGateway-saas",
      },
      {
        id: "session-gateway-3",
        title: "Locating Session List API",
        lastMessage: "Mapped controllers and endpoints in the auth gateway.",
        updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14d
        projectName: "imGateway-saas",
      },
    ],
  },
];

export const INITIAL_MESSAGES: Record<string, Message[]> = {
  "session-deepseek-1": [
    {
      id: "msg-1-1",
      sessionId: "session-deepseek-1",
      role: "user",
      content: "在壳上添加 sqllite 扩展，保存下个迭代会用到的会话列表等",
      createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    {
      id: "msg-1-2",
      sessionId: "session-deepseek-1",
      role: "assistant",
      content: `我已成功在原生壳（Tauri Backend）上集成了 SQLite 扩展，并在统一桥接层中封装了会话保存等数据库接口。

### 运行的修改：
1. **原生壳配置**：
   - \`Cargo.toml\`: 引入了 \`tauri-plugin-sql\` 并开启了 \`sqlite\` 支持。
   - \`lib.rs\`: 初始化并注册了 SQL 插件。
   - \`capabilities/default.json\`: 配置了细粒度安全权限，授权 \`sql:default\`、\`sql:allow-execute\`、\`sql:allow-select\` 动作对目标数据库 \`sqlite:deepseek_code.db\` 进行访问。
2. **统一前端 API**：
   - 运行 \`bun add @tauri-apps/plugin-sql\` 引入前端 SQLite 驱动。
   - \`types.ts\`: 新增会话结构 \`Session\` 类型，并在统一的 \`IBridge\` 门面接口中添加了以下四个方法：
     - \`initDb()\`：初始化表结构（创建会话表 \`sessions\`）。
     - \`saveSession(session)\`：插入/替换保存会话。
     - \`getSessions()\`：获取会话列表（按时间倒序）。
     - \`deleteSession(id)\`：删除指定会话。
3. **适配器实现**：
   - \`tauri.ts\`: 实现了基于 \`tauri-plugin-sql\` 对本地 \`deepseek_code.db\` SQLite 文件的真实数据读写与连接池缓存。
   - \`mock.ts\`: 编写了基于浏览器 \`localStorage\` (以 \`bridge_mock_sessions\` 为 Key) 的降级存储方案，保证本地纯前端开发/浏览器测试同样能存取会话，完全不崩溃。
4. **文档同步**：
   - 更新了 \`docs/route-map.md\` 文档的通信桥梁说明，增加了对 SQLite 以及 Mock 机制的描述。

### 验证与编译：
- **前端编译验证**：通过 \`bun run build\` 验证，Vite 与 TypeScript 别名引用、新增的底层库全部打包顺利，没有类型错误。
- **Rust 后端验证**：使用 \`cargo check\` 检测通过，成功载入 Rust 原生插件并编译运行。

关于变更的详细日志，请参阅更新后的 \`walkthrough.md\`。下个迭代您可以随时使用 \`bridge.initDb()\`、\`bridge.getSessions()\` 等接口开始开发会话业务！`,
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      filesChanged: [
        { name: "route-map.md", path: "docs" },
        { name: "README.md", path: "/Users/yudong22/Documents/deepseek-code" },
        { name: "tsconfig.json", path: "/Users/yudong22/Documents/deepseek-code" },
        { name: "vite.config.ts", path: "/Users/yudong22/Documents/deepseek-code" },
        { name: "types.ts", path: "src/bridge" },
        { name: "tauri.ts", path: "src/bridge" },
        { name: "mock.ts", path: "src/bridge" },
        { name: "index.ts", path: "src/bridge" },
        { name: "Cargo.toml", path: "src-tauri" },
        { name: "lib.rs", path: "src-tauri/src" },
        { name: "default.json", path: "src-tauri/capabilities" },
        { name: "App.tsx", path: "src" }
      ],
      artifacts: [
        { name: "Walkthrough", type: "walkthrough" },
        { name: "Task", type: "task" },
        { name: "Implementation Plan", type: "implementation_plan" }
      ]
    }
  ],
  "session-gateway-1": [
    {
      id: "msg-2-1",
      sessionId: "session-gateway-1",
      role: "user",
      content: "Update Robot Thread Documentations",
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    },
    {
      id: "msg-2-2",
      sessionId: "session-gateway-1",
      role: "assistant",
      content: "I have updated the multi-threading flow graphs and thread pool configurations inside `imGateway-saas` docs.",
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    }
  ]
};
