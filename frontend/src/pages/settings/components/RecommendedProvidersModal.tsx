import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CardActions,
  Button,
  IconButton
} from "@mui/material";
import { Close as CloseIcon, AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";
import {
  Recommendation,
  PRICING_LABEL,
  PRICING_COLOR,
  formatUsd
} from "./SettingsTypes.js";

interface RecommendedProvidersModalProps {
  open: boolean;
  onClose: () => void;
  recommendations: Recommendation[];
  disclaimer?: string;
}

export const RecommendedProvidersModal: React.FC<RecommendedProvidersModalProps> = ({
  open,
  onClose,
  recommendations,
  disclaimer
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Proveedores Recomendados y Comparativa
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Cerrar">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Compara opciones locales y en la nube para elegir el mejor equilibrio entre privacidad, costo y velocidad de procesamiento para tus transcripciones y análisis con IA.
        </Typography>

        <Grid container spacing={2}>
          {recommendations.map((rec) => (
            <Grid item xs={12} sm={6} key={rec.id}>
              <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    {rec.name}
                  </Typography>

                  <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                    <Chip size="small" label={PRICING_LABEL[rec.pricing]} color={PRICING_COLOR[rec.pricing]} />
                    <Chip
                      size="small"
                      label={rec.kind === "local" ? "100% Local" : "API Cloud"}
                      color={rec.kind === "local" ? "primary" : "secondary"}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={rec.diarization ? "Separa hablantes" : "Sin separar hablantes"}
                      color={rec.diarization ? "info" : "default"}
                      variant="outlined"
                    />
                    {!rec.supported && <Chip size="small" label="Próximamente" variant="outlined" />}
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Calidad:</strong> {rec.quality}
                  </Typography>
                  {rec.freeTier && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      <strong>Capa gratuita:</strong> {rec.freeTier}
                    </Typography>
                  )}

                  <Table size="small" aria-label={`Tiempo y costo estimados de ${rec.name}`} sx={{ mb: 1.5 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ px: 0.5 }}>Caso</TableCell>
                        <TableCell sx={{ px: 0.5 }}>Tiempo ({rec.speedBasis})</TableCell>
                        <TableCell sx={{ px: 0.5 }} align="right">Costo</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {([
                        ["Clip de 5 min", rec.speedByCase.fiveMin, rec.approxCostPerHourUsd / 12],
                        ["Reunión de 1 h", rec.speedByCase.oneHour, rec.approxCostPerHourUsd],
                        ["Archivo de 10 h", rec.speedByCase.tenHours, rec.approxCostPerHourUsd * 10]
                      ] as [string, string, number][]).map(([label, time, cost]) => (
                        <TableRow key={label}>
                          <TableCell sx={{ px: 0.5 }}>{label}</TableCell>
                          <TableCell sx={{ px: 0.5 }}>{time}</TableCell>
                          <TableCell sx={{ px: 0.5 }} align="right">{formatUsd(cost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Privacidad:</strong> {rec.privacy}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {rec.notes}
                  </Typography>
                </CardContent>

                {rec.signupUrl && (
                  <CardActions sx={{ px: 2, pb: 2 }}>
                    <Button
                      size="small"
                      href={rec.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Crear Cuenta / Obtener Clave
                    </Button>
                  </CardActions>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>

        {disclaimer && (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 3, fontStyle: "italic", textAlign: "center" }}
          >
            {disclaimer}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="contained" size="small">
          Entendido
        </Button>
      </DialogActions>
    </Dialog>
  );
};
