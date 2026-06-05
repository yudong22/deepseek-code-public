use crate::safety::validate_path;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use super::AgentTool;

pub struct FileWriteTool {
    pub workspace_root: PathBuf,
}

#[derive(Deserialize)]
struct WriteArgs {
    path: String,
    content: String,
}

impl AgentTool for FileWriteTool {
    fn name(&self) -> &'static str {
        "FileWrite"
    }

    fn description(&self) -> &'static str {
        "在本地项目工作区中创建一个全新文件并写入内容。\n\
         注意事项：\n\
         - 仅在需要【新建文件】时使用。若要修改现有文件，禁止使用此工具，应使用 `FileEdit`。\n\
         - 如果目标文件已存在，该操作将会失败报错。"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "要创建文件的绝对路径（必须位于工作区内）"
                },
                "content": {
                    "type": "string",
                    "description": "要写入的完整文本内容"
                }
            },
            "required": ["path", "content"]
        })
    }

    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>> {
        Box::pin(async move {
            let args: WriteArgs = match serde_json::from_value(args) {
                Ok(a) => a,
                Err(e) => return json!({ "error": format!("参数解析错误：{}", e) }),
            };

            let path_ref = Path::new(&args.path);
            let validated = match validate_path(&self.workspace_root, path_ref) {
                Ok(p) => p,
                Err(e) => return json!({ "error": e }),
            };

            if validated.exists() {
                return json!({ "error": format!("文件已存在：{}。要修改现有文件，请必须使用 FileEdit 工具，严禁直接覆盖新建！", args.path) });
            }

            if let Some(parent) = validated.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return json!({ "error": format!("创建文件父目录失败：{}", e) });
                }
            }

            match fs::write(&validated, args.content) {
                Ok(_) => json!({ "success": true, "message": format!("文件新建写入成功：{}", args.path) }),
                Err(e) => json!({ "error": format!("写入文件失败：{}", e) }),
            }
        })
    }
}
