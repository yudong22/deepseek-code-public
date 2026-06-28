import { fileBaseName } from "./toolUtils";

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
  if (file.endsWith(".tsx") || file.endsWith(".ts")) return "📘";
  if (file.endsWith(".jsx") || file.endsWith(".js")) return "📒";
  if (file.endsWith(".rs")) return "🦀";
  if (file.endsWith(".md")) return "📝";
  if (file.endsWith(".json")) return "📋";
  if (file.endsWith(".css")) return "🎨";
  if (file.endsWith(".html")) return "🌐";
  if (file.endsWith(".toml") || file.endsWith(".yaml") || file.endsWith(".yml")) return "⚙️";
  if (file.endsWith(".py")) return "🐍";
  if (file.endsWith(".go")) return "🔷";
  if (file.endsWith(".sql")) return "🗃️";
  if (file.endsWith(".sh") || file.endsWith(".bash")) return "💻";
  if (file.endsWith(".svg") || file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) return "🖼️";
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
    <div
      className="file-autocomplete-dropdown"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {files.map((file, idx) => {
        const name = fileBaseName(file);
        const dir = file.substring(0, file.length - name.length);
        const isSelected = idx === selectedIndex;
        return (
          <div
            key={file}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors min-w-0 ${
              isSelected
                ? "bg-brand-blue text-white"
                : "text-zinc-800 dark:text-label-primary hover:bg-zinc-100 dark:hover:bg-surface-secondary"
            }`}
            onClick={() => onSelect(file)}
          >
            <span className="text-base shrink-0 leading-none">{getFileIcon(file)}</span>
            <span className="font-semibold truncate shrink-0">{name}</span>
            {dir && (
              <span
                className={`truncate text-[11px] font-mono ml-1 ${
                  isSelected ? "text-white/70" : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {dir}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
