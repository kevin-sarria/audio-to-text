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
  CircularProgress
} from "@mui/material";
import { Folder as FolderIcon, AutoFixHigh as AutoFixIcon } from "@mui/icons-material";
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
            sx={{ mb: 2 }}
          />

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
