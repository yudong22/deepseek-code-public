import React, { useState, useEffect } from "react";
import { bridge } from "@/bridge";
import { version as appVersion } from "../../package.json";

/** 在外部浏览器打开 URL（Tauri 和浏览器双环境兼容）*/
async function openExternalUrl(url: string) {
  try {
    // Tauri 环境：使用 tauri-plugin-opener
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // 浏览器环境：回退到 window.open
    window.open(url, "_blank");
  }
}

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
      if (result.hasUpdate) {
        setUpdateStatus({
          type: "success",
          message: (
            <div>
              <p style={{ fontWeight: "600", marginBottom: "4px" }}>发现新版本: v{result.version}</p>
              <pre style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: "11px",
                color: "#48484a",
                background: "#e5e5ea",
                padding: "8px",
                borderRadius: "4px",
                margin: "4px 0 8px 0",
                maxHeight: "120px",
                overflowY: "auto",
                border: "1px solid #d1d1d6",
                textAlign: "left"
              }}>
                {result.changelog}
              </pre>
              <button
                type="button"
                onClick={() => openExternalUrl(`https://github.com/yudong22/deepseek-code-public/releases/tag/v${result.version}`)}
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  backgroundColor: "#007aff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "500"
                }}
              >
                立即去下载
              </button>
            </div>
          )
        });
      } else {
        setUpdateStatus({ type: "info", message: "您的应用已是最新版本。" });
      }
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
