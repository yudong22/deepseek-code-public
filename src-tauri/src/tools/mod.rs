use serde_json::Value;

/// 自定义 AgentTool Trait，符合 OpenAI/DeepSeek 标准的 Tool Call 规范。
#[allow(async_fn_in_trait)]
pub trait AgentTool: Send + Sync {
    /// 工具名称，例如 "FileRead"
    fn name(&self) -> &'static str;

    /// 工具的详细描述，指导大模型在何时以及如何使用它
    fn description(&self) -> &'static str;

    /// 工具参数的 JSON Schema 定义
    fn parameters(&self) -> Value;

    /// 执行该工具的具体逻辑
    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>>;
}

pub mod file_read;
pub mod file_write;
pub mod file_edit;
pub mod grep;
pub mod glob;
pub mod bash;

pub use file_read::FileReadTool;
pub use file_write::FileWriteTool;
pub use file_edit::FileEditTool;
pub use grep::GrepTool;
pub use glob::GlobTool;
pub use bash::BashTool;
