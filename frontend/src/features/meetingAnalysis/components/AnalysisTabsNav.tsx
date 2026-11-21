import React from "react";
import { Box, Tabs, Tab } from "@mui/material";
import {
  Code as CodeIcon,
  AssignmentTurnedIn as SummaryIcon,
  CheckCircle as StatusIcon,
  HelpOutline as QuestionIcon
} from "@mui/icons-material";

interface AnalysisTabsNavProps {
  activeTab: number;
  onChangeTab: (newTab: number) => void;
  issuesCount: number;
  statusCount?: number;
  questionsCount?: number;
}

const tabSx = {
  textTransform: "none",
  fontWeight: 600,
  fontSize: "0.88rem",
  borderRadius: "8px",
  minHeight: 40,
  "&.Mui-selected": {
    backgroundColor: "background.paper",
    color: "primary.main",
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)"
  }
};

export const AnalysisTabsNav: React.FC<AnalysisTabsNavProps> = ({
  activeTab,
  onChangeTab,
  issuesCount,
  statusCount = 0,
  questionsCount = 0
}) => {
  return (
    <Box
      sx={{
        mb: 3,
        p: 0.5,
        borderRadius: "12px",
        border: 1,
        borderColor: "divider",
        backgroundColor: (theme) =>
          theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(_, val) => onChangeTab(val)}
        variant="scrollable"
        scrollButtons="auto"
        TabIndicatorProps={{ sx: { display: "none" } }}
        sx={{ minHeight: 40, "& .MuiTabs-flexContainer": { gap: 0.5 } }}
      >
        <Tab
          disableRipple
          icon={<CodeIcon fontSize="small" />}
          iconPosition="start"
          label={`Issues (${issuesCount})`}
          sx={tabSx}
        />
        <Tab
          disableRipple
          icon={<SummaryIcon fontSize="small" />}
          iconPosition="start"
          label="Resumen"
          sx={tabSx}
        />
        <Tab
          disableRipple
          icon={<StatusIcon fontSize="small" />}
          iconPosition="start"
          label={`Estado (${statusCount})`}
          sx={tabSx}
        />
        <Tab
          disableRipple
          icon={<QuestionIcon fontSize="small" />}
          iconPosition="start"
          label={questionsCount ? `Preguntas (${questionsCount})` : "Preguntas"}
          sx={tabSx}
        />
      </Tabs>
    </Box>
  );
};
