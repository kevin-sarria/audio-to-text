import React from "react";
import {
  Paper,
  Typography,
  Box,
  Alert,
  Chip,
  Grid,
  TextField,
  Button,
  Divider,
  Card,
  CardContent,
  CardActions
} from "@mui/material";
import {
  PlayArrow as TestIcon,
  Delete as DeleteIcon,
  Add as AddIcon
} from "@mui/icons-material";
import { CustomAiProviderDto } from "@audio-to-text/shared";
import { KeysInfo } from "./SettingsTypes.js";

interface ApiKeysSectionProps {
  keys: KeysInfo;
  groqKeyInput: string;
  onGroqKeyInputChange: (val: string) => void;
  geminiKeyInput: string;
  onGeminiKeyInputChange: (val: string) => void;
  openaiKeyInput: string;
  onOpenaiKeyInputChange: (val: string) => void;
  onSaveKey: (provider: string) => void;
  onTestKey: (provider: string) => void;
  onDeleteKey: (provider: string) => void;
  customProviders: CustomAiProviderDto[];
  onOpenCustomModal: () => void;
  onDeleteCustomProvider: (id: string) => void;
  testResult: { provider: string; ok: boolean; msg: string } | null;
  onCloseTestResult: () => void;
}

export const ApiKeysSection: React.FC<ApiKeysSectionProps> = ({
  keys,
  groqKeyInput,
  onGroqKeyInputChange,
  geminiKeyInput,
  onGeminiKeyInputChange,
  openaiKeyInput,
  onOpenaiKeyInputChange,
  onSaveKey,
  onTestKey,
  onDeleteKey,
  customProviders,
  onOpenCustomModal,
  onDeleteCustomProvider,
  testResult,
  onCloseTestResult
}) => {
  return (
    <Paper sx={{ p: 3, mb: 4 }}>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Claves de API (Almacén Cifrado)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Tus claves se guardan cifradas con el almacén seguro nativo de tu sistema operativo. La aplicación nunca expone el valor completo.
      </Typography>

      {testResult && (
        <Alert
          severity={testResult.ok ? "success" : "error"}
          sx={{ mb: 3 }}
          onClose={onCloseTestResult}
        >
          [{testResult.provider.toUpperCase()}] {testResult.msg}
        </Alert>
      )}

      {/* Proveedor: Groq */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Groq Cloud
          </Typography>
          {keys.groq?.hasKey && (
            <Chip
              size="small"
              label={`Guardada (••••${keys.groq?.last4})`}
              color="success"
              variant="outlined"
            />
          )}
        </Box>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="password"
              placeholder={keys.groq?.hasKey ? "Reemplazar clave..." : "gsk_..."}
              value={groqKeyInput}
              onChange={(e) => onGroqKeyInputChange(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onSaveKey("groq")}
                disabled={!groqKeyInput.trim()}
              >
                Guardar
              </Button>
              {keys.groq?.hasKey && (
                <>
                  <Button
                    size="small"
                    color="secondary"
                    startIcon={<TestIcon />}
                    onClick={() => onTestKey("groq")}
                  >
                    Probar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => onDeleteKey("groq")}
                  >
                    Quitar
                  </Button>
                </>
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Proveedor: Google Gemini */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Google Gemini API (AI Studio)
          </Typography>
          {keys.gemini?.hasKey && (
            <Chip
              size="small"
              label={`Guardada (••••${keys.gemini.last4})`}
              color="success"
              variant="outlined"
            />
          )}
        </Box>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="password"
              placeholder={keys.gemini?.hasKey ? "Reemplazar clave..." : "AIzaSy..."}
              value={geminiKeyInput}
              onChange={(e) => onGeminiKeyInputChange(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onSaveKey("gemini")}
                disabled={!geminiKeyInput.trim()}
              >
                Guardar
              </Button>
              {keys.gemini?.hasKey && (
                <>
                  <Button
                    size="small"
                    color="secondary"
                    startIcon={<TestIcon />}
                    onClick={() => onTestKey("gemini")}
                  >
                    Probar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => onDeleteKey("gemini")}
                  >
                    Quitar
                  </Button>
                </>
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Proveedor: OpenAI */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            OpenAI (ChatGPT / GPT-4o)
          </Typography>
          {keys.openai?.hasKey && (
            <Chip
              size="small"
              label={`Guardada (••••${keys.openai.last4})`}
              color="success"
              variant="outlined"
            />
          )}
        </Box>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="password"
              placeholder={keys.openai?.hasKey ? "Reemplazar clave..." : "sk-..."}
              value={openaiKeyInput}
              onChange={(e) => onOpenaiKeyInputChange(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onSaveKey("openai")}
                disabled={!openaiKeyInput.trim()}
              >
                Guardar
              </Button>
              {keys.openai?.hasKey && (
                <>
                  <Button
                    size="small"
                    color="secondary"
                    startIcon={<TestIcon />}
                    onClick={() => onTestKey("openai")}
                  >
                    Probar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => onDeleteKey("openai")}
                  >
                    Quitar
                  </Button>
                </>
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Proveedores Personalizados */}
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Proveedores de IA Personalizados (Ollama, DeepSeek, OpenRouter...)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Agrega cualquier LLM nuevo o local compatible con la especificación de API de OpenAI.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onOpenCustomModal}
          >
            Agregar Proveedor
          </Button>
        </Box>

        {customProviders.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
            No has registrado ningún proveedor personalizado todavía. Puedes agregar endpoints locales como Ollama o APIs como DeepSeek con el botón superior.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {customProviders.map((cp) => (
              <Grid item xs={12} sm={6} key={cp.id}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {cp.name}
                      </Typography>
                      <Chip size="small" label={cp.defaultModel} color="primary" variant="outlined" />
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                      {cp.baseUrl}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 1.5 }}>
                    <Button
                      size="small"
                      color="secondary"
                      startIcon={<TestIcon />}
                      onClick={() => onTestKey(cp.id)}
                    >
                      Probar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => onDeleteCustomProvider(cp.id)}
                    >
                      Eliminar
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Paper>
  );
};
