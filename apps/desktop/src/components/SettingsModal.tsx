import React, { useState, useEffect } from "react";
import { bridge } from "@/bridge";
import { version as appVersion } from "../../package.json";


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
  const [isChecking, setIsChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    type: "info" | "success" | "error";
    message: React.ReactNode;
  } | null>(null);

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

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    setUpdateStatus({ type: "info", message: "正在检查更新..." });
    try {
      const result = await bridge.checkForUpdates();
      if (!result.hasUpdate) {
        setUpdateStatus({ type: "info", message: "您的应用已是最新版本。" });
        return;
      }
      setUpdateStatus({ type: "info", message: `正在下载 v${result.version}...` });
      const version = result.version || "unknown";
      await bridge.installUpdate((status) => {
        if (status.status === "downloading" && status.progress !== undefined) {
          setUpdateStatus({
            type: "info",
            message: `📦 更新下载中 ${status.progress}%`,
          });
        } else if (status.status === "downloaded") {
          // v0.5.2: 下载完成 → 弹原生确认框，用户确认后才 install+relaunch。
          setUpdateStatus({
            type: "info",
            message: `v${version} 已下载完成，等待您确认是否立即重启...`,
          });
          (async () => {
            const ok = await bridge.confirmUpdateInstall(version);
            if (ok) {
              setUpdateStatus({ type: "success", message: "正在重启应用以应用更新..." });
              try {
                await bridge.installDownloadedUpdate();
              } catch (err) {
                setUpdateStatus({ type: "error", message: `重启失败: ${String(err)}` });
              }
            } else {
              setUpdateStatus({
                type: "info",
                message: `已取消更新。v${version} 文件已下载，下次手动重启或再次检查更新时应用。`,
              });
            }
          })();
        } else if (status.status === "error") {
          setUpdateStatus({
            type: "error",
            message: `更新失败: ${status.error || "未知错误"}`,
          });
        }
      });
    } catch (err) {
      setUpdateStatus({ type: "error", message: `检查更新失败: ${String(err)}` });
    } finally {
      setIsChecking(false);
    }
  };

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
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => onWorkspaceChange(e.target.value)}
                placeholder="留空则使用默认沙箱目录"
                className="settings-input"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={async () => {
                  const path = await bridge.selectDirectory();
                  if (path) {
                    onWorkspaceChange(path);
                  }
                }}
                className="btn-secondary"
                style={{
                  padding: "0 12px",
                  height: "32px",
                  fontSize: "12px",
                  border: "1px solid #d1d1d6",
                  borderRadius: "6px",
                  background: "#f2f2f7",
                  cursor: "pointer"
                }}
              >
                浏览...
              </button>
            </div>
            <p className="settings-hint" style={{ color: "#8e8e93", marginTop: "4px" }}>
              {workspacePath.trim() ? (
                <span>AI 将在此目录内读写文件：<code style={{ fontSize: "11px", background: "#f2f2f7", padding: "1px 4px", borderRadius: "3px" }}>{workspacePath}</code></span>
              ) : (
                <span>留空时使用 App 数据目录下的 <code style={{ fontSize: "11px", background: "#f2f2f7", padding: "1px 4px", borderRadius: "3px" }}>sandbox_workspace/</code> 作为沙箱</span>
              )}
            </p>
          </div>

          {/* 关于与更新 */}
          <div className="form-group" style={{ marginTop: "16px", borderTop: "1px solid #e3e3e3", paddingTop: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>关于与更新</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#1d1d1f" }}>当前版本: v{appVersion}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCheckUpdates}
                  disabled={isChecking}
                  style={{
                    padding: "4px 10px",
                    fontSize: "12px",
                    backgroundColor: "#f2f2f7",
                    border: "1px solid #d1d1d6",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {isChecking ? "正在检查..." : "检查更新"}
                </button>
              </div>
              {updateStatus && (
                <div style={{
                  fontSize: "12px",
                  color: updateStatus.type === "success" ? "#000" : updateStatus.type === "error" ? "#ff3b30" : "#8e8e93",
                  padding: "10px",
                  backgroundColor: "#f2f2f7",
                  border: "1px solid #e5e5ea",
                  borderRadius: "6px",
                  marginTop: "4px",
                  lineHeight: "1.4"
                }}>
                  {updateStatus.message}
                </div>
              )}
            </div>
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
