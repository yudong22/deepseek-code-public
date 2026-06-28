//! Glob tool: finds files matching a glob pattern in the workspace.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct GlobTool;

impl Tool for GlobTool {
    fn name(&self) -> &'static str {
        "glob"
    }

    fn description(&self) -> &'static str {
        "Find files matching a glob pattern in the workspace. Returns relative file paths."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match files (e.g., '**/*.rs', 'src/**/*.ts')"
                }
            },
            "required": ["pattern"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let pattern = input
            .get("pattern")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if pattern.is_empty() {
            return ToolResult::error("No glob pattern provided");
        }

        let mut files: Vec<String> = Vec::new();

        // Walk the workspace directory using ignore crate to respect .gitignore
        let workspace = ctx.workspace_path.clone();
        let mut builder = ignore::WalkBuilder::new(&workspace);
        builder.hidden(true); // ignore hidden files/directories (starting with .)
        builder.require_git(false); // respect gitignore even if not in a git repo
        builder.filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            name != "node_modules" && name != "target" && name != ".git"
        });

        for entry in builder.build() {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                continue;
            }

            let relative = entry
                .path()
                .strip_prefix(&ctx.workspace_path)
                .unwrap_or(entry.path());

            let relative_str = relative.to_string_lossy();

            if simple_glob_match(pattern, &relative_str) {
                files.push(relative_str.to_string());
            }
        }

        let total = files.len();
        files.truncate(200);

        ToolResult::success(serde_json::json!({
            "files": files,
            "total_matches": total,
            "truncated": total > 200,
        }))
    }
}

/// Simple glob matching that handles `**/*.ext`, `*.ext`, and literal patterns.
///
/// Supports:
/// - `**/*.rs` — matches any `.rs` file in any subdirectory
/// - `**/foo*` — matches files starting with "foo" anywhere
/// - `*.rs` — matches `.rs` files in the root only
/// - `src/**/*.ts` — matches `.ts` files under `src/`
fn simple_glob_match(pattern: &str, path: &str) -> bool {
    // Fast path: exact match
    if pattern == path {
        return true;
    }

    // Handle `**/<suffix>` patterns — match suffix anywhere
    if let Some(suffix) = pattern.strip_prefix("**/") {
        // Match suffix at the end of the path (like `*.rs`) or as part of path
        if path.ends_with(suffix) {
            return true;
        }
        // Also try glob matching each path component
        return path.split('/').any(|seg| single_seg_match(suffix, seg));
    }

    // Handle `<prefix>/**/<suffix>` patterns
    if let Some(star_pos) = pattern.find("/**/") {
        let prefix = &pattern[..star_pos];
        let suffix = &pattern[star_pos + 4..]; // skip "/**/"
        if !path.starts_with(prefix) {
            return false;
        }
        let rest = &path[prefix.len()..];
        let rest = rest.strip_prefix('/').unwrap_or(rest);
        return rest.ends_with(suffix) || rest.split('/').any(|s| single_seg_match(suffix, s));
    }

    // For simple patterns like `*.rs`, match against basename
    if !pattern.contains('/') {
        let basename = path.rsplit('/').next().unwrap_or(path);
        return single_seg_match(pattern, basename);
    }

    false
}

/// Match a pattern against a single path segment.
/// Supports `*` (any sequence) and `?` (single char) wildcards.
fn single_seg_match(pattern: &str, segment: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if !pattern.contains('*') && !pattern.contains('?') {
        return pattern == segment;
    }
    // Simple recursive wildcard match
    wildcard_match(pattern.as_bytes(), segment.as_bytes())
}

/// Match a glob pattern with * and ? against a string.
fn wildcard_match(pat: &[u8], s: &[u8]) -> bool {
    if pat.is_empty() {
        return s.is_empty();
    }
    match pat[0] {
        b'*' => {
            // * matches zero or more characters
            wildcard_match(&pat[1..], s)
                || (!s.is_empty() && wildcard_match(pat, &s[1..]))
        }
        b'?' => {
            // ? matches exactly one character
            !s.is_empty() && wildcard_match(&pat[1..], &s[1..])
        }
        c => {
            // Literal character match
            !s.is_empty() && s[0] == c && wildcard_match(&pat[1..], &s[1..])
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob_finds_rust_files() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::write(tmp.path().join("src/main.rs"), "fn main() {}").unwrap();
        std::fs::write(tmp.path().join("src/lib.rs"), "pub fn add() {}").unwrap();
        std::fs::write(tmp.path().join("README.md"), "# README").unwrap();

        let tool = GlobTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({"pattern": "**/*.rs"}),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                let files: Vec<&str> = output["files"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap())
                    .collect();
                assert!(files.iter().any(|f| f.contains("main.rs")));
                assert!(files.iter().any(|f| f.contains("lib.rs")));
                assert!(!files.iter().any(|f| f.contains("README.md")));
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn glob_nested_pattern() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("src/components")).unwrap();
        std::fs::write(tmp.path().join("src/index.ts"), "export {}").unwrap();
        std::fs::write(tmp.path().join("src/components/Button.tsx"), "// Button").unwrap();

        let tool = GlobTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({"pattern": "src/**/*.ts"}),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                let files: Vec<&str> = output["files"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap())
                    .collect();
                assert!(files.iter().any(|f| f.contains("index.ts")));
                // .tsx should not match .ts pattern
                assert!(!files.iter().any(|f| f.contains("Button.tsx")));
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn glob_empty_pattern() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = GlobTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(serde_json::json!({"pattern": ""}), &ctx);
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn glob_respects_gitignore() {
        let tmp = tempfile::tempdir().unwrap();
        // Create files
        std::fs::write(tmp.path().join("allowed.rs"), "fn main() {}").unwrap();
        std::fs::write(tmp.path().join("ignored.rs"), "fn main() {}").unwrap();
        // Create gitignore
        std::fs::write(tmp.path().join(".gitignore"), "ignored.rs\n").unwrap();

        let tool = GlobTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({"pattern": "**/*.rs"}),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                let files: Vec<&str> = output["files"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap())
                    .collect();
                assert!(files.iter().any(|f| f.contains("allowed.rs")));
                assert!(!files.iter().any(|f| f.contains("ignored.rs")));
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn simple_glob_match_tests() {
        // **/suffix patterns
        assert!(simple_glob_match("**/*.rs", "src/main.rs"));
        assert!(simple_glob_match("**/*.rs", "lib.rs"));
        assert!(!simple_glob_match("**/*.rs", "README.md"));

        // prefix/**/suffix patterns
        assert!(simple_glob_match("src/**/*.ts", "src/index.ts"));
        assert!(simple_glob_match("src/**/*.ts", "src/sub/deep/file.ts"));
        assert!(!simple_glob_match("src/**/*.ts", "test/index.ts"));

        // Simple patterns (match basename)
        assert!(simple_glob_match("*.rs", "src/main.rs"));
        assert!(simple_glob_match("*.rs", "lib.rs"));

        // Wildcard patterns
        assert!(simple_glob_match("**/test*", "testing.rs"));
        assert!(simple_glob_match("**/test*", "src/test_utils.rs"));
    }
}
