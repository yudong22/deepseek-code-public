use crate::safety::validate_path;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use super::AgentTool;

pub struct FileReadTool {
    pub workspace_root: PathBuf,
}

#[derive(Deserialize)]
struct ReadArgs {
    path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
}

impl AgentTool for FileReadTool {
    fn name(&self) -> &'static str {
        "FileRead"
    }

    fn description(&self) -> &'static str {
        "读取本地项目工作区中的文件内容。\n\
         注意事项：\n\
         - `path` 必须是在项目工作区内的绝对路径，不能超出项目根目录。\n\
         - 默认会按行号返回内容（从 1 开始计数，格式类似于 cat -n，以 6位行号 + tab 拼接）。\n\
         - 推荐在了解目标区域后，指定 start_line 和 end_line 读取特定段落，以节约上下文 Token。"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "要读取文件的绝对路径（必须位于工作区内）"
                },
                "start_line": {
                    "type": "integer",
                    "description": "可选。开始读取的行号（从 1 开始计数，包含此行）"
                },
                "end_line": {
                    "type": "integer",
                    "description": "可选。结束读取的行号（从 1 开始计数，包含此行）"
                }
            },
            "required": ["path"]
        })
    }

    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>> {
        Box::pin(async move {
            let args: ReadArgs = match serde_json::from_value(args) {
                Ok(a) => a,
                Err(e) => return json!({ "error": format!("参数解析错误：{}", e) }),
            };

            let path_ref = Path::new(&args.path);
            let validated = match validate_path(&self.workspace_root, path_ref) {
                Ok(p) => p,
                Err(e) => return json!({ "error": e }),
            };

            if !validated.is_file() {
                return json!({ "error": format!("目标不是一个有效文件：{}", args.path) });
            }

            let file = match File::open(&validated) {
                Ok(f) => f,
                Err(e) => return json!({ "error": format!("无法打开文件：{}", e) }),
            };

            let start = args.start_line.unwrap_or(1).max(1);
            let reader = BufReader::new(file);
            let mut lines = Vec::new();

            for (idx, line_res) in reader.lines().enumerate() {
                let line_num = idx + 1;
                
                if let Some(end) = args.end_line {
                    if line_num > end {
                        break;
                    }
                }

                if line_num >= start {
                    match line_res {
                        Ok(line) => {
                            lines.push(format!("{:>6}\t{}", line_num, line));
                        }
                        Err(e) => return json!({ "error": format!("读取文件第 {} 行时出错：{}", line_num, e) }),
                    }
                }
            }

            if lines.is_empty() {
                json!({ "content": "[文件内容为空]" })
            } else {
                json!({ "content": lines.join("\n") })
            }
        })
    }
}
