import { useState, useEffect, useCallback } from "react";
import { ProjectFolderDto, CreateProjectFolderSchema } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";

export function useProjectFolders() {
  const [folders, setFolders] = useState<ProjectFolderDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: ProjectFolderDto[] }>("/project-folders");
      if (res.success && res.data) {
        setFolders(res.data);
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar las carpetas de proyecto.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const createFolder = async (data: {
    name: string;
    description?: string;
    technicalContext: string;
    defaultProvider?: string;
    defaultModel?: string;
    customApiKey?: string;
  }) => {
    const res = await api.post<{ success: boolean; data: ProjectFolderDto }>("/project-folders", data);
    if (res.success) {
      await fetchFolders();
      return res.data;
    }
    throw new Error("No se pudo crear la carpeta de proyecto.");
  };

  const updateFolder = async (
    id: string,
    data: {
      name?: string;
      description?: string;
      technicalContext?: string;
      defaultProvider?: string;
      defaultModel?: string;
      customApiKey?: string;
    }
  ) => {
    const res = await api.put<{ success: boolean; data: ProjectFolderDto }>(`/project-folders/${id}`, data);
    if (res.success) {
      await fetchFolders();
      return res.data;
    }
    throw new Error("No se pudo actualizar la carpeta de proyecto.");
  };

  const deleteFolder = async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/project-folders/${id}`);
    if (res.success) {
      await fetchFolders();
    }
  };

  return {
    folders,
    isLoading,
    error,
    refreshFolders: fetchFolders,
    createFolder,
    updateFolder,
    deleteFolder
  };
}
