import { useState } from "react";
import { bridge } from "@/bridge";

interface UseSettingsProps {
  showToast: (msg: string) => void;
  navigate: (path: string | number) => void;
  loadSessions: () => Promise<void>;
}

export function useSettings({ showToast, navigate, loadSessions }: UseSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("deepseek-v4-flash");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [workspacePath, setWorkspacePath] = useState("");
  const [savedWorkspacePath, setSavedWorkspacePath] = useState("");

  async function handleSaveApiKey() {
    try {
      if (!apiKey.trim()) {
        showToast("API Key 不能为空");
        return;
      }
      await bridge.saveSetting("deepseek_api_key", apiKey.trim());
      setSavedApiKey(apiKey.trim());

      if (workspacePath.trim()) {
        await bridge.saveSetting("workspace_path", workspacePath.trim());
        setSavedWorkspacePath(workspacePath.trim());
      } else {
        await bridge.deleteSetting("workspace_path");
        setSavedWorkspacePath("");
      }

      showToast("设置已保存");
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("保存设置失败:", err);
      showToast("保存失败，请重试");
    }
  }

  async function handleClearApiKey() {
    try {
      await bridge.deleteSetting("deepseek_api_key");
      setApiKey("");
      setSavedApiKey(null);
      showToast("API Key 已清除");
    } catch (err) {
      console.error("清除 API Key 失败:", err);
      showToast("清除失败，请重试");
    }
  }

  async function handleClearHistory() {
    try {
      const allSessions = await bridge.getSessions();
      for (const s of allSessions) {
        await bridge.deleteSession(s.id);
      }
      showToast("历史会话已全部清空");
      setIsSettingsOpen(false);
      navigate("/");
      await loadSessions();
    } catch (err) {
      console.error("清空历史会话失败:", err);
      showToast("清空失败，请重试");
    }
  }

  return {
    apiKey,
    setApiKey,
    savedApiKey,
    setSavedApiKey,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedModel,
    setSelectedModel,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    workspacePath,
    setWorkspacePath,
    savedWorkspacePath,
    setSavedWorkspacePath,
    handleSaveApiKey,
    handleClearApiKey,
    handleClearHistory,
  };
}
