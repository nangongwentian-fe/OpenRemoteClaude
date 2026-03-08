import { useState, useCallback, useEffect } from "react";
import type { Project } from "../types/messages";

const STORAGE_KEY = "rcc_active_project";

export function useProjects(token: string | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  // 初始化时从 localStorage 恢复 activeProject
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setActiveProjectState(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list: Project[] = data.projects || [];
        setProjects(list);
        // 如果 activeProject 不再存在于列表中，重置
        setActiveProjectState((prev) => {
          if (prev && !list.some((p) => p.path === prev.path)) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
          }
          return prev;
        });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchProjects();
  }, [token, fetchProjects]);

  const switchProject = useCallback((project: Project | null) => {
    setActiveProjectState(project);
    if (project) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const addProject = useCallback(
    async (path: string, name?: string) => {
      if (!token) return;
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, name }),
      });
      if (res.ok) {
        const data = await res.json();
        const newProject: Project = data.project;
        setProjects((prev) => [...prev, newProject]);
        // 自动切换到新添加的项目
        switchProject(newProject);
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to add project");
      }
    },
    [token, switchProject]
  );

  const removeProject = useCallback(
    async (path: string) => {
      if (!token) return;
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.path !== path));
        // 如果删除的是 activeProject，重置
        setActiveProjectState((prev) => {
          if (prev?.path === path) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
          }
          return prev;
        });
      }
    },
    [token]
  );

  return {
    projects,
    activeProject,
    loading,
    fetchProjects,
    switchProject,
    addProject,
    removeProject,
  };
}
