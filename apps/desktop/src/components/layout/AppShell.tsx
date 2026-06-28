import React from "react";
import Toast from "@/components/Toast";
import SettingsModal from "@/components/SettingsModal";
import ProjectSettingsModal from "@/components/ProjectSettingsModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { UpdateStatus } from "@/hooks/useAppUpdates";
import type { ToastItem } from "@/hooks/useToast";

export interface AppShellProps {
  // ── 全局主题 ──
  isNightMode: boolean;
  // ── Toast ──
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  // ── Settings Modal ──
  isSettingsOpen: boolean;
  apiKey: string;
  savedApiKey: string | null;
  onSettingsClose: () => void;
  onApiKeyChange: (k: string) => void;
  onSaveApiKey: () => void;
  onClearApiKey: () => void;
  onClearHistory: () => void;
  updateStatus: UpdateStatus | null;
  isCheckingUpdate: boolean;
  onCheckUpdates: () => void;
  // ── Project Settings Modal ──
  isProjectSettingsOpen: boolean;
  projectSettingsTarget: string | null;
  onProjectSettingsClose: () => void;
  workspacePath: string;
  onWorkspaceChange: (p: string) => void;
  projectSessionCount: number;
  onDeleteProject: (path: string) => void;
  // ── Clear History Confirm ──
  showClearHistoryConfirm: boolean;
  onClearHistoryConfirm: () => void;
  onClearHistoryCancel: () => void;
  // ── Main content (TitleBar + left + center + right) ──
  children: React.ReactNode;
}

/** MainDashboard 根容器 + Toast + Modals 层（v0.5.13 拆分） */
export function AppShell(props: AppShellProps) {
  const {
    isNightMode,
    toasts,
    dismissToast,
    isSettingsOpen,
    apiKey,
    savedApiKey,
    onSettingsClose,
    onApiKeyChange,
    onSaveApiKey,
    onClearApiKey,
    onClearHistory,
    updateStatus,
    isCheckingUpdate,
    onCheckUpdates,
    isProjectSettingsOpen,
    projectSettingsTarget,
    onProjectSettingsClose,
    workspacePath,
    onWorkspaceChange,
    projectSessionCount,
    onDeleteProject,
    showClearHistoryConfirm,
    onClearHistoryConfirm,
    onClearHistoryCancel,
    children,
  } = props;

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-surface-primary text-zinc-900 dark:text-zinc-100 transition-[background-color] duration-200 ${isNightMode ? "night-mode" : ""}`}
    >
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <SettingsModal
        isOpen={isSettingsOpen}
        apiKey={apiKey}
        savedApiKey={savedApiKey}
        onClose={onSettingsClose}
        onApiKeyChange={onApiKeyChange}
        onSave={onSaveApiKey}
        onClear={onClearApiKey}
        onClearHistory={onClearHistory}
        updateStatus={updateStatus}
        isChecking={isCheckingUpdate}
        onCheckUpdates={onCheckUpdates}
      />

      <ProjectSettingsModal
        isOpen={isProjectSettingsOpen}
        projectPath={projectSettingsTarget || ""}
        projectName={projectSettingsTarget ? projectSettingsTarget.split(/[/\\]/).pop() || "" : ""}
        workspacePath={workspacePath}
        sessionCount={projectSessionCount}
        onClose={onProjectSettingsClose}
        onWorkspaceChange={onWorkspaceChange}
        onDeleteProject={onDeleteProject}
      />

      <ConfirmDialog
        open={showClearHistoryConfirm}
        title="确认清除历史"
        message="确定要清除所有会话记录吗？此操作不可撤销。"
        confirmLabel="清除"
        danger
        onConfirm={onClearHistoryConfirm}
        onCancel={onClearHistoryCancel}
      />

      {children}
    </div>
  );
}
