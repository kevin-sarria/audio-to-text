import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Typography,
  CircularProgress,
  Tabs,
  Tab,
  Box
} from "@mui/material";
import { Folder as FolderIcon } from "@mui/icons-material";
import type {
  ProjectFolderDto,
  CustomAiProviderDto,
  ProjectProfileSummaryDto,
  ProjectContextScanReportDto,
  ContextScanJobDto
} from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { BasicSection } from "./folderModal/BasicSection.js";
import { ScanSection } from "./folderModal/ScanSection.js";
import { AiConfigSection } from "./folderModal/AiConfigSection.js";
import { buildFolderPayload } from "./folderModal/folderPayload.js";
import { TEMPLATE_CONTEXT } from "./folderModal/templateContext.js";
import { pollScanJob } from "./folderModal/pollScanJob.js";

interface ProjectFolderModalProps {
  open: boolean;
  onClose: () => void;
  folder?: ProjectFolderDto | null;
  onSaved?: (folder: ProjectFolderDto) => void;
}

export const ProjectFolderModal: React.FC<ProjectFolderModalProps> = ({
  open,
  onClose,
  folder,
  onSaved
}) => {
  // Pestaña activa: 0 = General, 1 = Escanear con IA, 2 = Configuración de IA
  const [activeTab, setActiveTab] = useState(0);

  // Estados del formulario
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [technicalContext, setTechnicalContext] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("google-account");
  const [defaultModel, setDefaultModel] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [profileId, setProfileId] = useState("generic");

  // Proveedores y perfiles
  const [customProviders, setCustomProviders] = useState<CustomAiProviderDto[]>([]);
  const [projectProfiles, setProjectProfiles] = useState<ProjectProfileSummaryDto[]>([]);
  const [profilesError, setProfilesError] = useState(false);

  // Estados de envío y error general
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para escaneo de repositorio con IA
  const [repoPath, setRepoPath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgressStage, setScanProgressStage] = useState("");
  const [scanElapsedSec, setScanElapsedSec] = useState(0);
  const [scanStatusMsg, setScanStatusMsg] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [scanSuccessNotice, setScanSuccessNotice] = useState(false);
  const [scanReport, setScanReport] = useState<ProjectContextScanReportDto | null>(null);
  const isCancelledRef = useRef(false);
  // Número del escaneo vigente: una consulta de un escaneo anterior no escribe en la pantalla.
  const scanRunRef = useRef(0);

  // Cancelar escaneo al cerrar modal o desmontar
  useEffect(() => {
    if (!open) {
      isCancelledRef.current = true;
      setIsScanning(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
    };
  }, []);

  // Contador de tiempo transcurrido durante el escaneo
  useEffect(() => {
    if (!isScanning) {
      setScanElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setScanElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isScanning]);

  const formatElapsedTime = (sec: number): string => {
    if (sec < 60) return `${sec} s`;
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${mins} min ${rem} s`;
  };

  // Cambio de proveedor: vaciar el modelo para que el selector rellene el predeterminado del nuevo proveedor
  const handleProviderChange = (newProvider: string) => {
    setDefaultProvider(newProvider);
    setDefaultModel("");
  };

  const handleBrowseFolder = async () => {
    if (window.desktop?.selectProjectFolder) {
      try {
        const selected = await window.desktop.selectProjectFolder();
        if (selected) {
          setRepoPath(selected);
          if (!name.trim()) {
            const baseName = selected.split(/[\\/]/).filter(Boolean).pop();
            if (baseName) setName(`Proyecto ${baseName}`);
          }
        }
      } catch (err: any) {
        setErrorMsg(`Error al abrir explorador de carpetas: ${err.message}`);
      }
    }
  };

  const handleScanRepository = async () => {
    if (!repoPath.trim()) {
      setScanStatusMsg({
        type: "warning",
        text: "Por favor indica o selecciona la ruta de la carpeta del proyecto a escanear."
      });
      return;
    }

    isCancelledRef.current = false;
    const runId = ++scanRunRef.current;
    const isStale = () => isCancelledRef.current || runId !== scanRunRef.current;
    setIsScanning(true);
    setScanProgressStage("Inventario y lectura del código");
    setScanElapsedSec(0);
    setScanStatusMsg(null);
    setScanSuccessNotice(false);
    setScanReport(null);
    setErrorMsg(null);

    try {
      const res = await api.post<{ success: boolean; data?: ContextScanJobDto; error?: string }>(
        "/project-folders/scan-context",
        {
          folderPath: repoPath.trim(),
          provider: defaultProvider,
          model: defaultModel.trim() || undefined,
          apiKey: customApiKey.trim() || undefined
        }
      );

      if (!res || !res.success || !res.data) {
        throw new Error(res?.error || "No se pudo iniciar el escaneo del repositorio.");
      }

      const completedJob = await pollScanJob({
        jobId: res.data.jobId,
        fetchJob: async (jobId) => {
          const check = await api.get<{ success: boolean; data?: ContextScanJobDto; error?: string }>(
            `/project-folders/scan-context/${jobId}`
          );
          if (!check || !check.success || !check.data) {
            throw new Error(check?.error || "Error al consultar estado del escaneo.");
          }
          return check.data;
        },
        onProgress: (job) => {
          if (job.progress && !isStale()) {
            setScanProgressStage(job.progress);
          }
        },
        isCancelled: isStale
      });

      if (isStale()) return;

      if (completedJob.status === "done" && completedJob.result?.technicalContext) {
        setTechnicalContext(completedJob.result.technicalContext);
        if (completedJob.result.report) {
          setScanReport(completedJob.result.report);
        }
        setScanSuccessNotice(true);
        setScanStatusMsg(null);
      } else if (completedJob.status === "error") {
        setScanStatusMsg({
          type: "error",
          text: `Error al escanear proyecto: ${completedJob.error || "Error desconocido"}`
        });
      } else {
        throw new Error("El escaneo finalizó con un estado desconocido.");
      }
    } catch (err: any) {
      if (isStale()) return;
      setScanStatusMsg({
        type: "error",
        text: `Error al escanear proyecto: ${err.message}`
      });
    } finally {
      if (!isStale()) {
        setIsScanning(false);
      }
    }
  };

  // Cargar proveedores y perfiles al abrir
  useEffect(() => {
    if (!open) return;

    api
      .get<any>("/desktop/settings")
      .then((res) => {
        if (res.success && res.data?.settings?.customProviders) {
          setCustomProviders(res.data.settings.customProviders);
        }
      })
      .catch(() => {});

    api
      .get<{ success: boolean; data: ProjectProfileSummaryDto[] }>("/project-profiles")
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setProjectProfiles(res.data);
          setProfilesError(false);
        } else {
          setProjectProfiles([{ id: "generic", name: "Genérico (sin reglas de negocio)", description: "" }]);
        }
      })
      .catch(() => {
        setProfilesError(true);
        setProjectProfiles([{ id: "generic", name: "Genérico (sin reglas de negocio)", description: "" }]);
      });
  }, [open]);

  // Inicializar estado del formulario al abrir
  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setDescription(folder.description || "");
      setTechnicalContext(folder.technicalContext);
      setDefaultProvider(folder.defaultProvider || "google-account");
      setDefaultModel(folder.defaultModel || "");
      setProfileId(folder.profileId || "generic");
      setCustomApiKey("");
    } else {
      setName("");
      setDescription("");
      setTechnicalContext(TEMPLATE_CONTEXT);
      setDefaultProvider("google-account");
      setDefaultModel("");
      setProfileId("generic");
      setCustomApiKey("");
    }
    setActiveTab(0);
    setErrorMsg(null);
    setScanStatusMsg(null);
    setScanSuccessNotice(false);
    setScanReport(null);
  }, [folder, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setActiveTab(0);
      setErrorMsg("El nombre de la carpeta de proyecto es obligatorio.");
      return;
    }
    if (!technicalContext.trim()) {
      setActiveTab(0);
      setErrorMsg("El contexto técnico del proyecto es obligatorio para guiar a los agentes de IA.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = buildFolderPayload(
        {
          name,
          description,
          technicalContext,
          defaultProvider,
          defaultModel,
          customApiKey,
          profileId
        },
        !!folder
      );

      let res: any;
      if (folder) {
        res = await api.put(`/project-folders/${folder.id}`, payload);
      } else {
        res = await api.post("/project-folders", payload);
      }

      if (res.success && res.data) {
        onSaved?.(res.data);
        onClose();
      } else {
        throw new Error(res.error || "Error al guardar la carpeta de proyecto.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FolderIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            {folder ? "Editar Carpeta de Proyecto" : "Nueva Carpeta de Proyecto (Harness de Contexto)"}
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ pb: 3 }}>
          {/* El Alert de error general queda arriba de las pestañas (visible en cualquiera) */}
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <Tabs
            value={activeTab}
            onChange={(_e, val) => setActiveTab(val)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label="General" />
            <Tab label="Escanear con IA" />
            <Tab label="Configuración de IA" />
          </Tabs>

          {/* Las 3 pestañas permanecen montadas para no perder estado ni re-montar el selector */}
          <Box sx={{ display: activeTab === 0 ? "block" : "none" }}>
            <BasicSection
              name={name}
              onNameChange={setName}
              description={description}
              onDescriptionChange={setDescription}
              technicalContext={technicalContext}
              onTechnicalContextChange={setTechnicalContext}
              onResetTemplate={() => setTechnicalContext(TEMPLATE_CONTEXT)}
            />
          </Box>

          <Box sx={{ display: activeTab === 1 ? "block" : "none" }}>
            <ScanSection
              repoPath={repoPath}
              onRepoPathChange={setRepoPath}
              onBrowseFolder={handleBrowseFolder}
              isScanning={isScanning}
              onScan={handleScanRepository}
              scanStatusMsg={scanStatusMsg}
              scanSuccessNotice={scanSuccessNotice}
              scanReport={scanReport}
              scanProgressText={
                scanProgressStage
                  ? `${scanProgressStage} · ${formatElapsedTime(scanElapsedSec)}`
                  : `Iniciando escaneo… · ${formatElapsedTime(scanElapsedSec)}`
              }
              defaultProvider={defaultProvider}
              defaultModel={defaultModel}
              customProviders={customProviders}
              onNavigateToGeneral={() => setActiveTab(0)}
              onNavigateToAiConfig={() => setActiveTab(2)}
            />
          </Box>

          <Box sx={{ display: activeTab === 2 ? "block" : "none" }}>
            <AiConfigSection
              profileId={profileId}
              onProfileIdChange={setProfileId}
              projectProfiles={projectProfiles}
              profilesError={profilesError}
              defaultProvider={defaultProvider}
              onProviderChange={handleProviderChange}
              defaultModel={defaultModel}
              onModelChange={setDefaultModel}
              customApiKey={customApiKey}
              onCustomApiKeyChange={setCustomApiKey}
              customProviders={customProviders}
              savedApiKey={Boolean(folder?.customApiKey)}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} /> : null}
          >
            {isSubmitting ? "Guardando..." : "Guardar Carpeta"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
