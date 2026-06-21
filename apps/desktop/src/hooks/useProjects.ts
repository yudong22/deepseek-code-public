import { useState } from "react";
import { bridge } from "@/bridge";

interface UseProjectsProps {
  showToast: (msg: string) => void;
  navigate: (path: string | number) => void;
  setWorkspacePath: (path: string) => void;
  setSavedWorkspacePath: (path: string) => void;
}

export function useProjects({
  showToast,
  navigate,
  setWorkspacePath,
  setSavedWorkspacePath,
}: UseProjectsProps) {
  const [projects, setProjects] = useState<string[]>([]);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const handleToggleProjectCollapse = (projectName: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectName]: !prev[projectName],
    }));
  };

  const handleAddProject = async () => {
    try {
      const selectedPath = await bridge.selectDirectory();
      if (!selectedPath) return;

      const updatedProjects = [...projects];
      if (!updatedProjects.includes(selectedPath)) {
        updatedProjects.push(selectedPath);
        setProjects(updatedProjects);
        await bridge.saveSetting("projects_list", JSON.stringify(updatedProjects));
      }

      setWorkspacePath(selectedPath);
      setSavedWorkspacePath(selectedPath);
      await bridge.saveSetting("workspace_path", selectedPath);

      const parts = selectedPath.split(/[/\\]/);
      const name = parts[parts.length - 1] || selectedPath;
      setCollapsedProjects((prev) => ({
        ...prev,
        [name]: false,
      }));

      showToast(`已导入项目并切换工作区为: ${selectedPath}`);
      navigate("/");
    } catch (err) {
      console.error("Failed to add project:", err);
      showToast("导入项目失败");
    }
  };

  const handleRemoveProject = async (projectPath: string) => {
    try {
      const updatedProjects = projects.filter((p) => p !== projectPath);
      setProjects(updatedProjects);
      await bridge.saveSetting("projects_list", JSON.stringify(updatedProjects));
      showToast("已移除项目");
    } catch (err) {
      console.error("Failed to remove project:", err);
      showToast("移除项目失败");
    }
  };

  const handleSelectProject = async (projectPath: string) => {
    try {
      setWorkspacePath(projectPath);
      setSavedWorkspacePath(projectPath);
      await bridge.saveSetting("workspace_path", projectPath);

      if (projectPath) {
        const parts = projectPath.split(/[/\\]/);
        const name = parts[parts.length - 1] || projectPath;
        setCollapsedProjects((prev) => ({
          ...prev,
          [name]: false,
        }));
      }

      showToast(`已切换工作区为: ${projectPath}`);
      navigate("/");
    } catch (err) {
      console.error("Failed to select project:", err);
    }
  };

  return {
    projects,
    setProjects,
    collapsedProjects,
    setCollapsedProjects,
    handleToggleProjectCollapse,
    handleAddProject,
    handleRemoveProject,
    handleSelectProject,
  };
}
