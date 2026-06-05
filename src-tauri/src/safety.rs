use std::path::{Path, PathBuf};

/// 校验目标路径在规范化后是否在项目工作区根路径中，防止路径穿越。
pub fn validate_path(workspace_root: &Path, target_path: &Path) -> Result<PathBuf, String> {
    // 1. 如果 target_path 是相对路径，将其拼接到 workspace_root 后面
    let absolute_target = if target_path.is_relative() {
        workspace_root.join(target_path)
    } else {
        target_path.to_path_buf()
    };

    // 2. 规范化工作区路径
    let canonical_workspace = workspace_root
        .canonicalize()
        .map_err(|e| format!("无法规范化工作区路径 '{}': {}", workspace_root.display(), e))?;

    // 3. 规范化目标路径（如果目标文件不存在，无法调用 canonicalize()，我们可以规范化其父目录）
    let canonical_target = match absolute_target.canonicalize() {
        Ok(path) => path,
        Err(_) => {
            // 如果文件不存在，规范化其父目录，再拼接文件名
            if let Some(parent) = absolute_target.parent() {
                let canonical_parent = parent.canonicalize().map_err(|e| {
                    format!("目标文件的父目录不存在或无效 '{}': {}", parent.display(), e)
                })?;
                if let Some(file_name) = absolute_target.file_name() {
                    canonical_parent.join(file_name)
                } else {
                    canonical_parent
                }
            } else {
                return Err(format!("目标路径无效: {}", absolute_target.display()));
            }
        }
    };

    // 4. 校验目标路径是否以规范化后的工作区根目录为前缀
    if canonical_target.starts_with(&canonical_workspace) {
        Ok(canonical_target)
    } else {
        Err(format!(
            "安全拒绝：目标路径 '{}' 超出了项目工作区边界 '{}'",
            canonical_target.display(),
            canonical_workspace.display()
        ))
    }
}
