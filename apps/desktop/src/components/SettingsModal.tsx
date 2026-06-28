import { useEffect } from "react";
import { version as appVersion } from "../../package.json";

interface SettingsModalProps {
  isOpen: boolean;
  apiKey: string;
  savedApiKey: string | null;
  onClose: () => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onClearHistory: () => void;
  updateStatus: {
    type: "info" | "success" | "error";
    message: string;
  } | null;
  isChecking: boolean;
  onCheckUpdates: () => void;
}

export default function SettingsModal({
  isOpen,
  apiKey,
  savedApiKey,
  onClose,
  onApiKeyChange,
  onSave,
  onClear,
  onClearHistory,
  updateStatus,
  isChecking,
  onCheckUpdates,
}: SettingsModalProps) {

  // Escape 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1100]" onClick={onClose}>
      <div className="bg-white dark:bg-surface-primary w-[460px] rounded-xl shadow-xl flex flex-col border border-zinc-200 dark:border-zinc-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-primary flex justify-between items-center shrink-0">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-label-primary m-0">设置</h3>
          <button className="text-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 bg-transparent border-0 cursor-pointer" onClick={onClose}>×</button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">DeepSeek API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="输入 sk-... API Key"
              className="w-full h-8 px-3 bg-surface-secondary hover:bg-surface-hover border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-label-primary placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors"
            />
            <p className="text-[10px] leading-normal mt-1">
              {savedApiKey ? (
                <span className="text-[#34c759] inline-flex items-center gap-1">
                  ● 已配置：客户端将直接请求 api.deepseek.com
                </span>
              ) : (
                <span className="text-[#8e8e93]">
                  ○ 未配置：将使用 Mock 模拟响应
                </span>
              )}
            </p>
          </div>

          {/* 关于与更新 */}
          <div className="flex flex-col gap-1.5 mt-4 border-t border-border-primary pt-4">
            <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase mb-1">关于与更新</label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-3 items-center">
                <span className="text-xs text-zinc-800 dark:text-label-primary">当前版本: v{appVersion}</span>
                <button
                  type="button"
                  onClick={onCheckUpdates}
                  disabled={isChecking}
                  className="h-7 px-2.5 bg-surface-secondary hover:bg-surface-hover border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors flex items-center justify-center"
                >
                  {isChecking ? "正在检查..." : "检查更新"}
                </button>
              </div>
              {updateStatus && (
                <div className={`text-xs p-2.5 bg-surface-secondary border border-zinc-250 dark:border-zinc-800 rounded-md mt-1 leading-relaxed ${
                  updateStatus.type === "success"
                    ? "text-[#34c759]"
                    : updateStatus.type === "error"
                    ? "text-red-500"
                    : "text-zinc-500"
                }`}>
                  {updateStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border-primary flex justify-end gap-2 shrink-0">
          <button className="h-8.5 px-4 bg-red-500 hover:bg-red-600 text-white border-0 rounded-md text-xs font-semibold cursor-pointer transition-colors mr-auto" onClick={onClearHistory}>
            清除历史
          </button>
          {savedApiKey && (
            <button className="h-8.5 px-4 bg-surface-secondary hover:bg-surface-hover border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors flex items-center justify-center" onClick={onClear}>
              清除 Key
            </button>
          )}
          <button className="h-8.5 px-4 bg-brand-blue hover:bg-brand-blue-hover text-white border-0 rounded-md text-xs font-semibold cursor-pointer transition-colors" onClick={onSave}>
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
