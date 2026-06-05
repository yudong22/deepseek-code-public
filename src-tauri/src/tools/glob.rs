use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{PathBuf};
use ignore::WalkBuilder;
use super::AgentTool;

pub struct GlobTool {
    pub workspace_root: PathBuf,
}

#[derive(Deserialize)]
struct GlobArgs {
    pattern: String,
}

impl AgentTool for GlobTool {
    fn name(&self) -> &'static str {
        "Glob"
    }

    fn description(&self) -> &'static str {
        "在项目工作区内模糊匹配定位文件路径列表。\n\
         注意事项：\n\
         - 自动遵循项目的 `.gitignore` 规则，忽略 node_modules、target、.git 等缓存和依赖文件夹，确保返回干净的文件列表。"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "用于匹配文件的 Glob 模式（例如 '**/types.ts', '**/*.rs', 'src/components/*.tsx'）"
                }
            },
            "required": ["pattern"]
        })
    }

    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>> {
        Box::pin(async move {
            let args: GlobArgs = match serde_json::from_value(args) {
                Ok(a) => a,
                Err(e) => return json!({ "error": format!("参数解析错误：{}", e) }),
            };

            let mut builder = globset::GlobSetBuilder::new();
            let glob = match globset::Glob::new(&args.pattern) {
                Ok(g) => g,
                Err(e) => return json!({ "error": format!("Glob 模式无效：{}", e) }),
            };
            builder.add(glob);
            let matcher = match builder.build() {
                Ok(m) => m,
                Err(e) => return json!({ "error": format!("Glob 模式构建失败：{}", e) }),
            };

            let mut matched_files = Vec::new();
            let walker = WalkBuilder::new(&self.workspace_root)
                .hidden(true)
                .git_ignore(true)
                .build();

            for result in walker {
                let entry = match result {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                if let Ok(rel_path) = path.strip_prefix(&self.workspace_root) {
                    if matcher.is_match(rel_path) {
                        matched_files.push(path.to_string_lossy().to_string());

                        // 达到上限强制截断
                        if matched_files.len() >= 100 {
                            return json!({
                                "files": matched_files,
                                "limit_reached": true,
                                "message": "匹配到的文件数已达上限 (100 个)。如果未找到目标，建议提供更具体的 glob 检索匹配模式。"
                            });
                        }
                    }
                }
            }

            json!({
                "files": matched_files,
                "limit_reached": false
            })
        })
    }
}
