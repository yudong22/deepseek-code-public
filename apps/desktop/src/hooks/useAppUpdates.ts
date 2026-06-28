import { useCallback, useState } from "react";
import { bridge } from "@/bridge";

export interface UpdateStatus {
  type: "info" | "success" | "error";
  message: string;
}

export interface UseAppUpdatesResult {
  updateStatus: UpdateStatus | null;
  isUpdateReady: boolean;
  isChecking: boolean;
  checkUpdates: (isStartup?: boolean) => Promise<void>;
  restartToUpdate: () => Promise<void>;
}

/** v0.5.9: 自动后台更新 — 检查 / 下载 / 应用一站式管理 */
export function useAppUpdates(showToast: (msg: string) => void): UseAppUpdatesResult {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkUpdates = useCallback(
    async (isStartup = false) => {
      setIsChecking(true);
      setUpdateStatus({ type: "info", message: "正在检查更新..." });
      try {
        const result = await bridge.checkForUpdates();
        if (!result.hasUpdate) {
          setUpdateStatus({ type: "info", message: "您的应用已是最新版本。" });
          return;
        }
        const version = result.version || "unknown";
        setUpdateStatus({ type: "info", message: `发现新版本 v${version}，正在下载更新...` });
        if (isStartup) {
          showToast(`📦 发现新版本 v${version}，正在后台下载更新...`);
        }
        await bridge.installUpdate((status) => {
          if (status.status === "downloading" && status.progress !== undefined) {
            setUpdateStatus({ type: "info", message: `📦 更新下载中 ${status.progress}%` });
          } else if (status.status === "downloaded") {
            setUpdateStatus({ type: "success", message: `v${version} 已下载完成，随时可重启应用以完成更新。` });
            setIsUpdateReady(true);
            showToast(`📦 新版本 v${version} 已下载完成，点击右上角"重启后安装"即可升级。`);
          } else if (status.status === "error") {
            setUpdateStatus({ type: "error", message: `更新失败: ${status.error || "未知错误"}` });
          }
        });
      } catch (err) {
        setUpdateStatus({ type: "error", message: `检查更新失败: ${String(err)}` });
      } finally {
        setIsChecking(false);
      }
    },
    [showToast],
  );

  const restartToUpdate = useCallback(async () => {
    try {
      setUpdateStatus({ type: "success", message: "正在重启应用以应用更新..." });
      await bridge.installDownloadedUpdate();
    } catch (err) {
      const msg = String(err);
      setUpdateStatus({ type: "error", message: `重启失败: ${msg}` });
      showToast(`重启失败: ${msg}`);
    }
  }, [showToast]);

  return { updateStatus, isUpdateReady, isChecking, checkUpdates, restartToUpdate };
}
