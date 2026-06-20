interface FileAutocompleteProps {
  /** 下拉框是否可见 */
  visible: boolean;
  /** 过滤后的文件列表 */
  files: string[];
  /** 当前键盘选中的索引 */
  selectedIndex: number;
  /** 选中文件回调 */
  onSelect: (filePath: string) => void;
  /** 关闭下拉框回调 */
  onDismiss: () => void;
}

/** 根据文件扩展名返回图标 */
function getFileIcon(file: string): string {
  if (file.endsWith(".tsx")) return "📘";
  if (file.endsWith(".ts")) return "📘";
  if (file.endsWith(".jsx")) return "📒";
  if (file.endsWith(".js")) return "📒";
  if (file.endsWith(".rs")) return "🦀";
  if (file.endsWith(".md")) return "📝";
  if (file.endsWith(".json")) return "📋";
  if (file.endsWith(".css")) return "🎨";
  if (file.endsWith(".html")) return "🌐";
  if (file.endsWith(".toml")) return "⚙️";
  if (file.endsWith(".yaml") || file.endsWith(".yml")) return "⚙️";
  if (file.endsWith(".svg")) return "🖼️";
  if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) return "🖼️";
  return "📄";
}

export default function FileAutocomplete({
  visible,
  files,
  selectedIndex,
  onSelect,
  onDismiss: _onDismiss,
}: FileAutocompleteProps) {
  if (!visible || files.length === 0) return null;

  return (
    <div className="file-autocomplete-dropdown" onClick={(e) => e.stopPropagation()}>
      {files.map((file, idx) => (
        <div
          key={file}
          className={`file-autocomplete-item ${idx === selectedIndex ? "active" : ""}`}
          onClick={() => onSelect(file)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
            cursor: "pointer",
            borderRadius: "4px",
            color: idx === selectedIndex ? "#fff" : "inherit",
            background: idx === selectedIndex ? "#007aff" : "transparent",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ opacity: 0.7, fontSize: "12px", flexShrink: 0 }}>
            {getFileIcon(file)}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {file}
          </span>
        </div>
      ))}
    </div>
  );
}
