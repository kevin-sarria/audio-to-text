import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Box,
  Typography,
  CircularProgress,
  Paper
} from "@mui/material";
import {
  Folder as FolderIcon,
  AutoFixHigh as AutoFixIcon,
  AutoAwesome as AutoAwesomeIcon,
  FolderOpen as BrowseFolderIcon
} from "@mui/icons-material";
import { ProjectFolderDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";

interface ProjectFolderModalProps {
  open: boolean;
  onClose: () => void;
  folder?: ProjectFolderDto | null;
  onSaved?: (folder: ProjectFolderDto) => void;
}

const TEMPLATE_CONTEXT = `PROYECTO: [Nombre del Sistema]
ARQUITECTURA: [Monorepo / Microservicios / Monolito]
STACK:
- Backend: [Ej. .NET 8, Express, NestJS, FastAPI]
- Frontend: [Ej. React 18, Vite, Next.js, Angular]
- Base de datos: [Ej. PostgreSQL, MySQL, SQL Server]
CONVENCIONES:
- Nomenclatura, estructura de carpetas y patrones de diseño utilizados
- Reglas para agentes de IA (Cursor, Antigravity, Claude Code)`;

export const ProjectFolderModal: React.FC<ProjectFolderModalProps> = ({
  open,
  onClose,
  folder,
  onSaved
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [technicalContext, setTechnicalContext] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("google-account");
  const [defaultModel, setDefaultModel] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");

  const [customProviders, setCustomProviders] = useState<{ id: string; name: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para escaneo de repositorio con IA
  const [repoPath, setRepoPath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

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

    setIsScanning(true);
    setScanStatusMsg(null);
    setErrorMsg(null);

    try {
      const res = await api.post<{ success: boolean; data?: { technicalContext: string }; error?: string }>(
        "/project-folders/scan-context",
        {
          folderPath: repoPath.trim(),
          provider: defaultProvider,
          model: defaultModel.trim() || undefined,
          apiKey: customApiKey.trim() || undefined
        }
      );

      if (res && res.success && res.data?.technicalContext) {
        setTechnicalContext(res.data.technicalContext);
        setScanStatusMsg({
          type: "success",
          text: "¡Contexto técnico generado e inyectado con éxito a partir de los archivos del repositorio!"
        });
      } else {
        throw new Error(res.error || "No se pudo extraer el contexto del repositorio.");
      }
    } catch (err: any) {
      setScanStatusMsg({
        type: "error",
        text: `Error al escanear proyecto: ${err.message}`
      });
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    // Cargar proveedores personalizados desde settings si existen
    api
      .get<any>("/desktop/settings")
      .then((res) => {
        if (res.success && res.data?.settings?.customProviders) {
          setCustomProviders(res.data.settings.customProviders);
        }
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setDescription(folder.description || "");
      setTechnicalContext(folder.technicalContext);
      setDefaultProvider(folder.defaultProvider || "google-account");
      setDefaultModel(folder.defaultModel || "");
      setCustomApiKey("");
    } else {
      setName("");
      setDescription("");
      setTechnicalContext(TEMPLATE_CONTEXT);
      setDefaultProvider("google-account");
      setDefaultModel("");
      setCustomApiKey("");
    }
    setErrorMsg(null);
  }, [folder, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("El nombre de la carpeta de proyecto es obligatorio.");
      return;
    }
    if (!technicalContext.trim()) {
      setErrorMsg("El contexto técnico del proyecto es obligatorio para guiar a los agentes de IA.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        technicalContext: technicalContext.trim(),
        defaultProvider: defaultProvider.trim() || undefined,
        defaultModel: defaultModel.trim() || undefined,
        customApiKey: customApiKey.trim() || undefined
      };

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

        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configura el contexto técnico y las credenciales de este proyecto. Todas las grabaciones y audios asignados a esta "carpeta" usarán automáticamente estas pautas para generar issues optimizadas para agentes de IA, sin tener que configurar las credenciales en cada transcripción.
          </Typography>

          <TextField
            fullWidth
            label="Nombre del Proyecto / Carpeta"
            placeholder="ej. Proyecto DIAMANTE (Limpieza Inteligente)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Descripción breve (opcional)"
            placeholder="ej. Sistema de gestión de servicios y facturación"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mb: 2.5 }}
          />

          {/* Sección de auto-escaneo del repositorio con IA */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 2,
              bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)")
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <AutoAwesomeIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight={700}>
                Escanear Repositorio con IA (Auto-generar Contexto Técnico)
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Selecciona la carpeta local de tu proyecto. La IA leerá la estructura de directorios, manifiestos (<code>package.json</code>, <code>csproj</code>...), markdowns y archivos de arquitectura para redactar automáticamente el contexto técnico.
            </Typography>

            <Alert severity="warning" sx={{ mb: 2, fontSize: "0.85rem", py: 0.5 }}>
              <strong>Aviso de facturación y consumo de tokens:</strong> Este análisis automático inspecciona la estructura y contenidos clave de tu código. Si utilizas un proveedor con API Key de pago (OpenAI, DeepSeek, etc.), esta operación <strong>consumirá tokens adicionales en tu facturación</strong>. Con <em>Cuenta de Google (Gemini Pro - Sin API Key)</em> no genera costos adicionales.
            </Alert>

            <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center" }}>
              <TextField
                fullWidth
                size="small"
                label="Ruta de la carpeta del proyecto / repositorio"
                placeholder="ej. C:\Users\TuUsuario\proyectos\mi-app"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<BrowseFolderIcon />}
                onClick={handleBrowseFolder}
                sx={{ whiteSpace: "nowrap", height: 40 }}
              >
                Examinar...
              </Button>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="contained"
                color="secondary"
                size="small"
                startIcon={isScanning ? <CircularProgress size={16} color="inherit" /> : <AutoFixIcon />}
                onClick={handleScanRepository}
                disabled={isScanning || !repoPath.trim()}
              >
                {isScanning ? "Analizando repositorio con IA..." : "Escanear y Auto-generar Contexto"}
              </Button>
              {isScanning && (
                <Typography variant="caption" color="text.secondary">
                  Inspeccionando arquitectura, dependencias y reglas de negocio...
                </Typography>
              )}
            </Box>

            {scanStatusMsg && (
              <Alert severity={scanStatusMsg.type} sx={{ mt: 1.5, fontSize: "0.85rem", py: 0.5 }}>
                {scanStatusMsg.text}
              </Alert>
            )}
          </Paper>

          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Contexto Técnico del Proyecto (Stack, Arquitectura, Módulos, Convenciones) *
            </Typography>
            <Button
              size="small"
              startIcon={<AutoFixIcon />}
              onClick={() => setTechnicalContext(TEMPLATE_CONTEXT)}
            >
              Restablecer Plantilla
            </Button>
          </Box>

          <TextField
            fullWidth
            multiline
            rows={7}
            value={technicalContext}
            onChange={(e) => setTechnicalContext(e.target.value)}
            placeholder="Describe aquí las tecnologías, arquitectura y convenciones de este proyecto..."
            helperText="La IA utilizará este contexto para deducir nombres de archivos, sugerir rutas exactas y redactar prompts listos para agentes como Cursor, Antigravity o Claude Code."
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Configuración de IA para esta Carpeta (Opcional)
          </Typography>

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <FormControl sx={{ minWidth: 260, flex: 1 }}>
              <InputLabel id="folder-provider-select">Proveedor de IA</InputLabel>
              <Select
                labelId="folder-provider-select"
                label="Proveedor de IA"
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
              >
                <MenuItem value="google-account">Cuenta de Google (Gemini Pro - Sin API Key)</MenuItem>
                <MenuItem value="gemini">Google Gemini API</MenuItem>
                <MenuItem value="openai">OpenAI (ChatGPT)</MenuItem>
                <MenuItem value="groq">Groq Cloud</MenuItem>
                {customProviders.map((cp) => (
                  <MenuItem key={cp.id} value={cp.id}>
                    {cp.name} (Personalizado)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              sx={{ flex: 1, minWidth: 200 }}
              label="Modelo preferido (opcional)"
              placeholder="ej. gemini-2.5-pro, gpt-4o, llama-3.3-70b"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            />
          </Box>

          {defaultProvider !== "google-account" && (
            <TextField
              fullWidth
              type="password"
              label="API Key específica para este proyecto (opcional)"
              placeholder={folder?.customApiKey ? "•••• (Guardada)" : "Dejar en blanco para usar la global de Configuración"}
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              helperText="Si no introduces una aquí, se utilizará la clave configurada globalmente en Ajustes."
            />
          )}
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
