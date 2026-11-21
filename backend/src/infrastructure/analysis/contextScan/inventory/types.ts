export type DateSource = "git" | "mtime";

export interface InventoryFileInfo {
  path: string;
  sizeBytes: number;
  lastModified: string;
  dateSource: DateSource;
}

/** Repo que forma parte del proyecto activo y aporta manifiestos, comandos y documentos. */
export interface RepoInfo {
  path: string;
  name: string;
  hasGit: boolean;
  headCommit: string | null;
  remoteUrl: string | null;
  /** Rama activa (null si HEAD está suelto o no se pudo leer). */
  branch: string | null;
  /** "repo": repo principal. "submodulo": submódulo de otro repo del proyecto. */
  kind: "repo" | "submodulo";
  /** Para un submódulo, el repo que lo contiene. */
  parentPath?: string;
  notes: string[];
}

/**
 * Carpeta que NO se analiza como parte del proyecto activo. Se reporta en una línea
 * y no aporta manifiestos, comandos, documentos ni plantillas.
 */
export type OtherFolderKind = "copia-de-trabajo" | "clon-duplicado" | "sin-git";

export interface OtherFolder {
  path: string;
  name: string;
  kind: OtherFolderKind;
  /** Repo del proyecto del que es copia o clon (null si está fuera de la carpeta escaneada). */
  ownerPath: string | null;
  branch: string | null;
  headCommit: string | null;
  /** Última modificación (carpetas sin git). */
  lastModified: string | null;
  notes: string[];
}

export type ManifestKind =
  | "npm"
  | "dotnet"
  | "dotnet-sln"
  | "maven"
  | "gradle"
  | "pip"
  | "pyproject"
  | "go"
  | "cargo"
  | "composer"
  | "gem";

export interface ManifestInfo {
  path: string;
  repo: string;
  kind: ManifestKind;
  name: string | null;
  version: string | null;
  frameworks: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  workspaces: string[];
}

export interface CommandInfo {
  repo: string;
  source: string;
  name: string;
  command: string;
  runAs: string;
}

export interface ParsedManifest {
  info: ManifestInfo;
  commands: CommandInfo[];
  isWorkspace: boolean;
}

export type DeploymentKind =
  | "github-workflow"
  | "gitlab-ci"
  | "azure-pipelines"
  | "dockerfile"
  | "docker-compose"
  | "nginx"
  | "procfile"
  | "pm2";

export interface DeploymentFileInfo {
  path: string;
  repo: string;
  kind: DeploymentKind;
  facts: string[];
  /** Resumen en una línea (workflows de CI): disparadores, entorno, acciones y comandos. */
  summary?: string;
}

export type DocumentCategory =
  | "agent-instructions"
  | "repo-rules"
  | "business-docs"
  | "readme"
  | "templates"
  | "other-docs"
  | "config-templates"
  | "historical";

/** 1 = se lee primero. 5 = histórico (planes, specs, documentos con fecha). */
export type DocumentPriority = 1 | 2 | 3 | 4 | 5;

export interface DocumentRef {
  path: string;
  repo: string;
  category: DocumentCategory;
  priority: DocumentPriority;
  sizeBytes: number;
  lastModified: string;
  dateSource: DateSource;
}

export interface DomainNames {
  entities: string[];
  migrations: string[];
  controllers: string[];
  routes: string[];
  pages: string[];
  i18n: string[];
}

/** Archivo de código (o de textos de pantalla) que leen los extractores de `code/`. */
export interface CodeFileRef {
  path: string;
  repo: string;
  sizeBytes: number;
  /** Orden de lectura (menor = antes): acceso, arranque, endpoints y datos primero. */
  priority: number;
  isTest: boolean;
}

export type RepoLayout ="single-repo" | "multi-repo" | "monorepo" | "no-git";

export interface SkippedFile {
  path: string;
  reason: "secret" | "gitignore" | "binary" | "too-large" | "excluded-folder";
}

export interface ProjectInventory {
  rootPath: string;
  generatedAt: string;
  layout: RepoLayout;
  workspaceManifests: string[];
  /** Solo los repos activos (principales y submódulos). */
  repositories: RepoInfo[];
  /** Copias de trabajo, clones duplicados y carpetas sin git: se listan aparte. */
  otherFolders: OtherFolder[];
  manifests: ManifestInfo[];
  commands: CommandInfo[];
  deployment: DeploymentFileInfo[];
  tree: string[];
  domain: DomainNames;
  documents: DocumentRef[];
  /** Grupos de documentos idénticos byte a byte (2 o más rutas por grupo). */
  identicalDocuments: string[][];
  /** Archivos de código de los repos activos, en orden de lectura. */
  codeFiles: CodeFileRef[];
  files:Record<string, InventoryFileInfo>;
  skipped: SkippedFile[];
}

export interface InventoryOptions {
  maxDepth?: number;
  treeDepth?: number;
  maxTreeLines?: number;
  useGit?: boolean;
}
