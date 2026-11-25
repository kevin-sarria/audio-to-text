export interface SummaryUtterance {
  speakerName: string;
  text: string;
  /** Segundos desde el inicio de la reunión. Ausente en transcripciones de texto plano. */
  offsetSec?: number;
}

export interface SummaryTopic {
  title: string;
  summary: string;
}

export interface SummaryDecision {
  text: string;
  evidence: string;
}

export interface SummaryActionItem {
  task: string;
  owner?: string;
  dueDate?: string;
  evidence: string;
}

export interface SummaryOpenQuestion {
  text: string;
  askedBy?: string;
}

export interface SummaryParticipant {
  name: string;
  speakingSeconds: number;
  speakingPercent: number;
}

export interface SummaryChapter {
  title: string;
  startSec: number;
  endSec: number;
}

export interface MeetingSummary {
  sessionId: string;
  generatedAt: string;
  language: string;
  executiveSummary: string;
  topics: SummaryTopic[];
  decisions: SummaryDecision[];
  actionItems: SummaryActionItem[];
  openQuestions: SummaryOpenQuestion[];
  participants: SummaryParticipant[];
  chapters: SummaryChapter[];
  /** Aviso cuando el resumen es el mínimo porque el LLM no estuvo disponible o falló. */
  note?: string;
}
