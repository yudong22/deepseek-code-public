use crate::safety::validate_path;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use super::AgentTool;

pub struct FileEditTool {
    pub workspace_root: PathBuf,
}

#[derive(Deserialize)]
struct EditArgs {
    path: String,
    old_string: String,
    new_string: String,
}

impl AgentTool for FileEditTool {
    fn name(&self) -> &'static str {
        "FileEdit"
    }

    fn description(&self) -> &'static str {
        "对工作区中的现有文件进行精准的文本内容替换（Exact Match & Replace）。\n\
         注意事项：\n\
         - 必须严格保留 `old_string` 的空格与缩进，并且不能包含 `FileRead` 返回的行号前缀（例如 \"    12\\t\"）。\n\
         - 如果 `old_string` 在文件中未找到，或者存在多处匹配（不唯一），修改将失败并报错。此时应提供包含更多上下文的 `old_string` 以确保其唯一性。"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件的绝对路径（必须位于工作区内）"
                },
                "old_string": {
                    "type": "string",
                    "description": "现有文件中需要被替换的精确字符串段落"
                },
                "new_string": {
                    "type": "string",
                    "description": "替换后的新字符串内容"
                }
            },
            "required": ["path", "old_string", "new_string"]
        })
    }

    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>> {
        Box::pin(async move {
            let args: EditArgs = match serde_json::from_value(args) {
                Ok(a) => a,
                Err(e) => return json!({ "error": format!("参数解析错误：{}", e) }),
            };

            let path_ref = Path::new(&args.path);
            let validated = match validate_path(&self.workspace_root, path_ref) {
                Ok(p) => p,
                Err(e) => return json!({ "error": e }),
            };

            if !validated.is_file() {
                return json!({ "error": format!("目标文件不存在或无效：{}", args.path) });
            }

            let content = match fs::read_to_string(&validated) {
                Ok(c) => c,
                Err(e) => return json!({ "error": format!("无法读取文件：{}", e) }),
            };

            // 校验唯一匹配
            let occurrences: Vec<_> = content.match_indices(&args.old_string).collect();
            if occurrences.is_empty() {
                return json!({
                    "error": "在文件中未找到与 old_string 匹配的段落。请确保：1. 缩进、换行和空格与原文件完全吻合；2. 绝不能带入 FileRead 所格式化的行号前缀（如 '     6\\t'）；3. 被匹配代码确实存在。"
                });
            }

            if occurrences.len() > 1 {
                return json!({
                    "error": format!("在文件中找到了多处 ({}) 相同的匹配。请提供更多上下文行（即更大范围 of old_string），以便在此文件中唯一锁定要替换的目标位置。", occurrences.len())
                });
            }

            // 进行单次精准替换
            let replaced = content.replacen(&args.old_string, &args.new_string, 1);

            match fs::write(&validated, replaced) {
                Ok(_) => json!({ "success": true, "message": format!("文件修改成功并保存：{}", args.path) }),
                Err(e) => json!({ "error": format!("保存修改写入文件失败：{}", e) }),
            }
        })
    }
}
