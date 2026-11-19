import { DevIssueDto, RepoHoursTotals } from "@audio-to-text/shared";

export interface MeetingAnalysisProps {
  id: string;
  sessionId: string;
  title?: string | null;
  projectContext?: string | null;
  summary: string;
  keyDecisions: string[];
  topicsDiscussed: string[];
  issues: DevIssueDto[];
  alreadyResolved?: string[] | null;
  inProgress?: string[] | null;
  globalOpenQuestions?: string[] | null;
  backlog?: string[] | null;
  repoHoursTotals?: RepoHoursTotals | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MeetingAnalysis {
  constructor(private props: MeetingAnalysisProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get sessionId(): string {
    return this.props.sessionId;
  }

  public get title(): string | null | undefined {
    return this.props.title;
  }

  public get projectContext(): string | null | undefined {
    return this.props.projectContext;
  }

  public get summary(): string {
    return this.props.summary;
  }

  public get keyDecisions(): string[] {
    return this.props.keyDecisions;
  }

  public get topicsDiscussed(): string[] {
    return this.props.topicsDiscussed;
  }

  public get issues(): DevIssueDto[] {
    return this.props.issues;
  }

  public get alreadyResolved(): string[] {
    return this.props.alreadyResolved || [];
  }

  public get inProgress(): string[] {
    return this.props.inProgress || [];
  }

  public get globalOpenQuestions(): string[] {
    return this.props.globalOpenQuestions || [];
  }

  public get backlog(): string[] {
    return this.props.backlog || [];
  }

  public get repoHoursTotals(): RepoHoursTotals | null | undefined {
    return this.props.repoHoursTotals;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public update(props: Partial<Omit<MeetingAnalysisProps, "id" | "sessionId" | "createdAt">>): void {
    if (props.title !== undefined) this.props.title = props.title;
    if (props.projectContext !== undefined) this.props.projectContext = props.projectContext;
    if (props.summary !== undefined) this.props.summary = props.summary;
    if (props.keyDecisions !== undefined) this.props.keyDecisions = props.keyDecisions;
    if (props.topicsDiscussed !== undefined) this.props.topicsDiscussed = props.topicsDiscussed;
    if (props.issues !== undefined) this.props.issues = props.issues;
    if (props.alreadyResolved !== undefined) this.props.alreadyResolved = props.alreadyResolved;
    if (props.inProgress !== undefined) this.props.inProgress = props.inProgress;
    if (props.globalOpenQuestions !== undefined) this.props.globalOpenQuestions = props.globalOpenQuestions;
    if (props.backlog !== undefined) this.props.backlog = props.backlog;
    if (props.repoHoursTotals !== undefined) this.props.repoHoursTotals = props.repoHoursTotals;
    this.props.updatedAt = new Date();
  }
}
