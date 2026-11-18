export interface ProjectFolderProps {
  id: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  technicalContext: string;
  defaultProvider?: string | null;
  defaultModel?: string | null;
  customApiKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectFolder {
  constructor(private props: ProjectFolderProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get userId(): string | null | undefined {
    return this.props.userId;
  }

  public get name(): string {
    return this.props.name;
  }

  public get description(): string | null | undefined {
    return this.props.description;
  }

  public get technicalContext(): string {
    return this.props.technicalContext;
  }

  public get defaultProvider(): string | null | undefined {
    return this.props.defaultProvider;
  }

  public get defaultModel(): string | null | undefined {
    return this.props.defaultModel;
  }

  public get customApiKey(): string | null | undefined {
    return this.props.customApiKey;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public update(props: Partial<Omit<ProjectFolderProps, "id" | "userId" | "createdAt">>): void {
    if (props.name !== undefined) this.props.name = props.name;
    if (props.description !== undefined) this.props.description = props.description;
    if (props.technicalContext !== undefined) this.props.technicalContext = props.technicalContext;
    if (props.defaultProvider !== undefined) this.props.defaultProvider = props.defaultProvider;
    if (props.defaultModel !== undefined) this.props.defaultModel = props.defaultModel;
    if (props.customApiKey !== undefined) this.props.customApiKey = props.customApiKey;
    this.props.updatedAt = new Date();
  }
}
