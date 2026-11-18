import React, { useRef, useEffect } from "react";
import { Box, Paper, IconButton, Slider, Typography } from "@mui/material";
import { PlayArrow, Pause, Forward10, Replay10 } from "@mui/icons-material";
import { useAppStore } from "../../store/index.js";

interface AudioPlayerProps {
  src?: string | null;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(mins)}:${pad(secs)}`;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    currentTimeMs,
    durationMs,
    isPlaying,
    seekTargetMs,
    audioBlobUrl,
    setCurrentTimeMs,
    setDurationMs,
    setIsPlaying,
    clearSeekTarget
  } = useAppStore();

  const effectiveSrc = src || audioBlobUrl;

  // Manejo de seek desde el store (p. ej. click en un segmento)
  useEffect(() => {
    if (seekTargetMs !== null && audioRef.current) {
      audioRef.current.currentTime = seekTargetMs / 1000;
      clearSeekTarget();
    }
  }, [seekTargetMs, clearSeekTarget]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const skipSeconds = (offset: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(audioRef.current.currentTime + offset, audioRef.current.duration || 0)
    );
  };

  const handleSliderChange = (_: Event, value: number | number[]) => {
    if (!audioRef.current) return;
    const targetSeconds = Array.isArray(value) ? value[0]! : value;
    audioRef.current.currentTime = targetSeconds;
    setCurrentTimeMs(targetSeconds * 1000);
  };

  if (!effectiveSrc) {
    return null;
  }

  const currentSeconds = currentTimeMs / 1000;
  const totalSeconds = durationMs / 1000;

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 3,
        position: "sticky",
        bottom: 16,
        zIndex: 10,
        backgroundColor: "background.paper",
        backdropFilter: "blur(8px)"
      }}
    >
      <audio
        ref={audioRef}
        src={effectiveSrc}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTimeMs(Math.round(audioRef.current.currentTime * 1000));
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDurationMs(Math.round(audioRef.current.duration * 1000));
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton size="small" onClick={() => skipSeconds(-10)} aria-label="Retroceder 10 segundos">
          <Replay10 />
        </IconButton>

        <IconButton
          color="primary"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          sx={{
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { backgroundColor: "primary.dark" }
          }}
        >
          {isPlaying ? <Pause /> : <PlayArrow />}
        </IconButton>

        <IconButton size="small" onClick={() => skipSeconds(10)} aria-label="Adelantar 10 segundos">
          <Forward10 />
        </IconButton>

        <Typography variant="caption" sx={{ minWidth: 45, textAlign: "right", fontFamily: "monospace" }}>
          {formatTime(currentSeconds)}
        </Typography>

        <Slider
          size="small"
          min={0}
          max={totalSeconds || 100}
          step={0.1}
          value={currentSeconds}
          onChange={handleSliderChange}
          aria-label="Línea de tiempo del audio"
          sx={{ flexGrow: 1 }}
        />

        <Typography variant="caption" sx={{ minWidth: 45, fontFamily: "monospace" }}>
          {formatTime(totalSeconds)}
        </Typography>
      </Box>
    </Paper>
  );
};
