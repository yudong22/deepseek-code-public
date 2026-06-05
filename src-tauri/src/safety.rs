use std::path::{Path, PathBuf};

/// 校验目标路径在规范化后是否在项目工作区根路径中，防止路径穿越。
/// 
/// 关键改进：当 AI 传来绝对路径但超出工作区时，自动将其"重基"到工作区内，
/// 而不是直接报错——即把路径的绝对前缀去掉，拼接在 workspace_root 下面。
pub fn validate_path(workspace_root: &Path, target_path: &Path) -> Result<PathBuf, String> {
    // 1. 规范化工作区路径（必须先做，因为后面要做前缀匹配）
    let canonical_workspace = workspace_root
        .canonicalize()
        .map_err(|e| format!("无法规范化工作区路径 '{}': {}", workspace_root.display(), e))?;

    // 2. 如果 target_path 是相对路径，直接拼接到 workspace_root
    if target_path.is_relative() {
        let joined = canonical_workspace.join(target_path);
        return resolve_final(&joined, &canonical_workspace);
    }

    // 3. target_path 是绝对路径：先尝试是否在 workspace 内
    match target_path.canonicalize() {
        Ok(canonical_target) => {
            if canonical_target.starts_with(&canonical_workspace) {
                return Ok(canonical_target);
            }
            // 超出 workspace：把绝对路径"重基"到 workspace 根目录
            rebase_into_workspace(&canonical_workspace, target_path)
        }
        Err(_) => {
            // 文件不存在：先检查父目录是否存在且在 workspace 内
            if let Some(parent) = target_path.parent() {
                if let Ok(canonical_parent) = parent.canonicalize() {
                    if canonical_parent.starts_with(&canonical_workspace) {
                        // 父目录在 workspace 内，允许（用于新建文件）
                        if let Some(file_name) = target_path.file_name() {
                            return Ok(canonical_parent.join(file_name));
                        }
                    }
                }
            }
            // 文件/父目录都不存在，或超出 workspace：重基处理
            rebase_into_workspace(&canonical_workspace, target_path)
        }
    }
}

/// 将一个绝对路径重基到 workspace 根目录下。
/// 例如：workspace=/sandbox, path=/Users/foo/bar/file.txt → /sandbox/Users/foo/bar/file.txt
/// 同时确保父目录存在（自动 create_dir_all）。
fn rebase_into_workspace(canonical_workspace: &Path, target_path: &Path) -> Result<PathBuf, String> {
    // 去掉路径最前面的根前缀（Unix 上是 "/"，Windows 上是 "C:\"）
    // 然后拼接到 workspace 下
    let relative_part: PathBuf = target_path
        .components()
        .filter(|c| !matches!(c, std::path::Component::Prefix(_) | std::path::Component::RootDir))
        .collect();

    let rebased = canonical_workspace.join(&relative_part);

    // 确保父目录存在
    if let Some(parent) = rebased.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                format!("创建目标目录失败 '{}': {}", parent.display(), e)
            })?;
        }
    }

    Ok(rebased)
}

/// 规范化最终路径，若文件不存在则规范化父目录后拼接文件名。
fn resolve_final(path: &Path, canonical_workspace: &Path) -> Result<PathBuf, String> {
    match path.canonicalize() {
        Ok(canonical) => {
            if canonical.starts_with(canonical_workspace) {
                Ok(canonical)
            } else {
                Err(format!(
                    "安全拒绝：目标路径 '{}' 超出了项目工作区边界 '{}'",
                    canonical.display(),
                    canonical_workspace.display()
                ))
            }
        }
        Err(_) => {
            // 文件不存在（新建场景）：规范化父目录
            if let Some(parent) = path.parent() {
                // 父目录也不存在时，尝试创建
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        format!("创建目标父目录失败 '{}': {}", parent.display(), e)
                    })?;
                }
                let canonical_parent = parent.canonicalize().map_err(|e| {
                    format!("目标文件的父目录无效 '{}': {}", parent.display(), e)
                })?;
                if !canonical_parent.starts_with(canonical_workspace) {
                    return Err(format!(
                        "安全拒绝：目标路径 '{}' 超出了项目工作区边界 '{}'",
                        canonical_parent.display(),
                        canonical_workspace.display()
                    ));
                }
                if let Some(file_name) = path.file_name() {
                    Ok(canonical_parent.join(file_name))
                } else {
                    Ok(canonical_parent)
                }
            } else {
                Err(format!("目标路径无效: {}", path.display()))
            }
        }
    }
}
