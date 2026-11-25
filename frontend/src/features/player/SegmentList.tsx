import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { SpeakerNameEditor } from "./SpeakerNameEditor.js";
import { SegmentState, SpeakerState } from "../../store/transcriberSlice.js";
import { useAppStore } from "../../store/index.js";

interface SegmentListProps {
  sessionId: string;
  segments: SegmentState[];
  speakers: SpeakerState[];
  activeSegmentId: string | null;
}

function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}`;
}

export const SegmentList: React.FC<SegmentListProps> = ({
  sessionId,
  segments,
  speakers,
  activeSegmentId
}) => {
  const seekTo = useAppStore((s) => s.seekTo);

  const speakerMap = new Map<string, SpeakerState>();
  speakers.forEach((s) => speakerMap.set(s.id, s));

  if (!segments || segments.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
        No hay segmentos disponibles para esta sesión.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, my: 2 }}>
      {segments.map((seg) => {
        const isActive = seg.id === activeSegmentId;
        const speaker = speakerMap.get(seg.speakerId);
        const speakerName = speaker?.customName || speaker?.label || "Hablante";

        return (
          <Paper
            key={seg.id}
            id={`segment-${seg.id}`}
            onClick={() => seekTo(seg.startTimeMs)}
            sx={{
              p: 2,
              borderRadius: 2,
              cursor: "pointer",
              transition: "all 0.2s ease",
              borderLeft: "4px solid",
              borderLeftColor: isActive ? "primary.main" : "transparent",
              backgroundColor: isActive ? "action.selected" : "background.paper",
              "&:hover": {
                backgroundColor: "action.hover"
              }
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.5
              }}
            >
              <Box onClick={(e) => e.stopPropagation()}>
                <SpeakerNameEditor
                  sessionId={sessionId}
                  speakerId={seg.speakerId}
                  initialName={speaker?.customName || ""}
                  label={speaker?.label || "Hablante"}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" fontWeight={500}>
                {formatTimeMs(seg.startTimeMs)} - {formatTimeMs(seg.endTimeMs)}
              </Typography>
            </Box>

            <Typography variant="body1" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              {seg.content}
            </Typography>
          </Paper>
        );
      })}
    </Box>
  );
};
