interface SettingsModalProps {
  isOpen: boolean;
  apiKey: string;
  savedApiKey: string | null;
  workspacePath: string;
  onClose: () => void;
  onApiKeyChange: (value: string) => void;
  onWorkspaceChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onClearHistory: () => void;
}

export default function SettingsModal({
  isOpen,
  apiKey,
  savedApiKey,
  workspacePath,
  onClose,
  onApiKeyChange,
  onWorkspaceChange,
  onSave,
  onClear,
  onClearHistory,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h3>设置</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="settings-modal-body">
          {/* API Key */}
          <div className="form-group">
            <label>DeepSeek API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="输入 sk-... API Key"
              className="settings-input"
            />
            <p className="settings-hint">
              {savedApiKey ? (
                <span style={{ color: "#34c759", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  ● 已配置：客户端将直接请求 api.deepseek.com
                </span>
              ) : (
                <span style={{ color: "#8e8e93" }}>
                  ○ 未配置：将使用 Mock 模拟响应
                </span>
              )}
            </p>
          </div>

          {/* Workspace Path */}
          <div className="form-group" style={{ marginTop: "16px" }}>
            <label>工作区目录（Workspace）</label>
            <input
              type="text"
              value={workspacePath}
              onChange={(e) => onWorkspaceChange(e.target.value)}
              placeholder="留空则使用默认沙箱目录"
              className="settings-input"
            />
            <p className="settings-hint" style={{ color: "#8e8e93" }}>
              {workspacePath.trim() ? (
                <span>AI 将在此目录内读写文件：<code style={{ fontSize: "11px", background: "#f2f2f7", padding: "1px 4px", borderRadius: "3px" }}>{workspacePath}</code></span>
              ) : (
                <span>留空时使用 App 数据目录下的 <code style={{ fontSize: "11px", background: "#f2f2f7", padding: "1px 4px", borderRadius: "3px" }}>sandbox_workspace/</code> 作为沙箱</span>
              )}
            </p>
          </div>
        </div>
        <div className="settings-modal-footer">
          <button className="btn-danger" style={{ background: "#ff3b30", color: "#fff", border: "none", marginRight: "auto" }} onClick={onClearHistory}>
            清除历史
          </button>
          {savedApiKey && (
            <button className="btn-secondary" onClick={onClear}>
              清除 Key
            </button>
          )}
          <button className="btn-primary" onClick={onSave}>
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
