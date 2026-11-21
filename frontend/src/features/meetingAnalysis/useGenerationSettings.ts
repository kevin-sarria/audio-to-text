import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  CustomAiProviderDto,
  ProjectFolderDto,
  MeetingAnalysisDto,
  ProjectProfileSummaryDto
} from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { DEFAULT_PROJECT_CONTEXT } from "./components/MeetingAnalysisMarkdown.js";
import { resolveGenerationSelection } from "./generationSelection.js";

const DEFAULT_GENERIC_PROFILE: ProjectProfileSummaryDto = {
  id: "generic",
  name: "Genérico (sin reglas de negocio)",
  description: "Aplica las reglas generales sin términos ni glosarios específicos de un proyecto."
};

interface UseGenerationSettingsParams {
  analysis: MeetingAnalysisDto | null;
  linkedFolder: ProjectFolderDto | null;
}

export function useGenerationSettings({
  analysis,
  linkedFolder
}: UseGenerationSettingsParams) {
  const [provider, setProviderState] = useState<string>("google-account");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customModel, setCustomModelState] = useState("");
  const [profileId, setProfileIdState] = useState<string>("generic");
  const [projectContext, setProjectContext] = useState(DEFAULT_PROJECT_CONTEXT);

  const [customProviders, setCustomProviders] = useState<CustomAiProviderDto[]>([]);
  const [projectProfiles, setProjectProfiles] = useState<ProjectProfileSummaryDto[]>([
    DEFAULT_GENERIC_PROFILE
  ]);
  const [profilesError, setProfilesError] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<{
    issuesDefaultProvider?: string;
    issuesDefaultModel?: string;
  } | null>(null);

  // Bandera para no pisar las decisiones manuales del usuario en la visita actual
  const [touched, setTouched] = useState(false);

  const setProvider = (val: string) => {
    setTouched(true);
    setProviderState(val);
    const matched = customProviders.find((cp) => cp.id === val);
    if (matched) {
      setCustomModelState(matched.defaultModel || "");
    }
  };

  const setCustomModel = (val: string) => {
    setTouched(true);
    setCustomModelState(val);
  };

  const setProfileId = (val: string) => {
    setTouched(true);
    setProfileIdState(val);
  };

  const updateProjectContext = (val: string) => {
    setTouched(true);
    setProjectContext(val);
  };

  const resetProjectContext = () => {
    setTouched(true);
    if (linkedFolder?.technicalContext) {
      setProjectContext(linkedFolder.technicalContext);
    } else {
      setProjectContext(DEFAULT_PROJECT_CONTEXT);
    }
  };

  // Carga de Ajustes globales y proveedores personalizados
  useEffect(() => {
    api
      .get<any>("/desktop/settings")
      .then((res) => {
        if (res.success && res.data) {
          if (res.data.settings?.customProviders) {
            setCustomProviders(res.data.settings.customProviders);
          }
          setGlobalSettings({
            issuesDefaultProvider: res.data.settings?.issuesDefaultProvider,
            issuesDefaultModel: res.data.settings?.issuesDefaultModel
          });
        }
      })
      .catch(() => {
        // En entorno web puro o sin endpoint desktop
      });
  }, []);

  // Carga de perfiles de proyecto desde el backend
  useEffect(() => {
    api
      .get<{ success: boolean; data: ProjectProfileSummaryDto[] }>("/project-profiles")
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setProjectProfiles(res.data);
          setProfilesError(false);
        } else {
          setProjectProfiles([DEFAULT_GENERIC_PROFILE]);
        }
      })
      .catch(() => {
        setProfilesError(true);
        setProjectProfiles([DEFAULT_GENERIC_PROFILE]);
      });
  }, []);

  // Sincronización automática de selección según la prioridad (meta -> folder -> settings -> fallback)
  // Solo se aplica si el usuario no ha tocado manualmente la selección en esta visita.
  useEffect(() => {
    if (touched) return;

    const resolved = resolveGenerationSelection({
      meta: analysis?.generationMeta,
      folder: linkedFolder,
      settings: globalSettings,
      customProviders
    });

    setProviderState(resolved.provider);
    setCustomModelState(resolved.model);
    setProfileIdState(resolved.profileId);

    // Contexto técnico: si el análisis guardado ya tiene uno, respetarlo; si no, usar el de la carpeta o plantilla
    if (analysis?.projectContext) {
      setProjectContext(analysis.projectContext);
    } else if (linkedFolder?.technicalContext) {
      setProjectContext(linkedFolder.technicalContext);
    } else {
      setProjectContext(DEFAULT_PROJECT_CONTEXT);
    }
  }, [analysis, linkedFolder, globalSettings, customProviders, touched]);

  // Etiquetas legibles para chips y cabecera
  const selectedProviderLabel = useMemo(() => {
    if (provider === "google-account") return "Cuenta de Google";
    if (provider === "gemini") return "Google Gemini API";
    if (provider === "openai") return "OpenAI";
    if (provider === "groq") return "Groq";
    const found = customProviders.find((cp) => cp.id === provider);
    return found?.name || provider;
  }, [provider, customProviders]);

  const selectedProfileName = useMemo(() => {
    const found = projectProfiles.find((p) => p.id === profileId);
    if (found) return found.name;
    if (profileId === "diamante") return "DIAMANTE (Limpieza Inteligente)";
    if (profileId === "generic") return "Genérico";
    return profileId;
  }, [profileId, projectProfiles]);

  return {
    provider,
    setProvider,
    customApiKey,
    setCustomApiKey,
    customModel,
    setCustomModel,
    profileId,
    setProfileId,
    projectContext,
    setProjectContext: updateProjectContext,
    resetProjectContext,
    customProviders,
    setCustomProviders,
    projectProfiles,
    profilesError,
    touched,
    setTouched,
    selectedProviderLabel,
    selectedProfileName
  };
}
