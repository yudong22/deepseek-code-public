use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{PathBuf};
use ignore::WalkBuilder;
use regex::Regex;
use super::AgentTool;

pub struct GrepTool {
    pub workspace_root: PathBuf,
}

#[derive(Deserialize)]
struct GrepArgs {
    query: String,
    glob_pattern: Option<String>,
}

impl AgentTool for GrepTool {
    fn name(&self) -> &'static str {
        "Grep"
    }

    fn description(&self) -> &'static str {
        "在项目工作区内进行高效的代码内容搜索（基于 ignore 库，支持多线程/单线程正则检索并自动过滤 .gitignore 声明的无关文件）。\n\
         注意事项：\n\
         - 凡是检索代码的任务，必须使用此工具。禁止在 `Bash` 工具中调用 `grep` 或 `rg` 命令行。\n\
         - 自动过滤 node_modules, target, build 等与源码无关的生成或依赖文件夹。"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索的正则表达式（例如 'fn query.*', 'interface\\\\s+\\\\w+'）"
                },
                "glob_pattern": {
                    "type": "string",
                    "description": "可选。限制搜索范围的文件 Glob 过滤规则（例如 '*.rs', 'src/**/*.tsx'）"
                }
            },
            "required": ["query"]
        })
    }

    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>> {
        Box::pin(async move {
            let args: GrepArgs = match serde_json::from_value(args) {
                Ok(a) => a,
                Err(e) => return json!({ "error": format!("参数解析错误：{}", e) }),
            };

            // 编译正则表达式
            let re = match Regex::new(&args.query) {
                Ok(r) => r,
                Err(e) => return json!({ "error": format!("正则表达式错误：{}", e) }),
            };

            // 编译 globset
            let glob_matcher = if let Some(ref pattern) = args.glob_pattern {
                let mut builder = globset::GlobSetBuilder::new();
                match globset::Glob::new(pattern) {
                    Ok(g) => {
                        builder.add(g);
                        match builder.build() {
                            Ok(set) => Some(set),
                            Err(e) => return json!({ "error": format!("Glob 模式构建失败：{}", e) }),
                        }
                    }
                    Err(e) => return json!({ "error": format!("Glob 模式无效：{}", e) }),
                }
            } else {
                None
            };

            let mut matches = Vec::new();
            // 遍历项目目录，默认包含 hidden(true) 和 git_ignore(true)
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

                // 校验 glob_pattern
                if let Some(ref matcher) = glob_matcher {
                    if let Ok(rel_path) = path.strip_prefix(&self.workspace_root) {
                        if !matcher.is_match(rel_path) {
                            continue;
                        }
                    } else {
                        continue;
                    }
                }

                // 执行检索
                if let Ok(content) = std::fs::read_to_string(path) {
                    for (idx, line) in content.lines().enumerate() {
                        if re.is_match(line) {
                            let path_str = path.to_string_lossy().to_string();
                            matches.push(json!({
                                "file": path_str,
                                "line": idx + 1,
                                "content": line.trim_end().to_string(),
                            }));

                            // 达到上限强制截断，以防输出内容过大撑满大模型上下文
                            if matches.len() >= 50 {
                                return json!({
                                    "matches": matches,
                                    "limit_reached": true,
                                    "message": "已达到匹配条数上限 (50 条)。如果未找到目标，请收窄搜索 query 词或增加 glob_pattern 过滤器范围。"
                                });
                            }
                        }
                    }
                }
            }

            json!({
                "matches": matches,
                "limit_reached": false
            })
        })
    }
}
