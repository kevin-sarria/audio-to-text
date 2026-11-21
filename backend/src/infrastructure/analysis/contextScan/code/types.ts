/**
 * Hechos extraídos del código sin IA (Fase 5). Cada uno lleva repo, archivo y línea
 * para que el modelo los cite y el verificador los confirme. Nunca hay valores de
 * configuración ni código crudo: solo nombres, rutas, roles y frases cortas.
 */

export interface CodeRef {
  repo: string;
  path: string;
  line: number;
}

/** Un archivo ya leído, tal como lo reciben los extractores. */
export interface SourceFile {
  repo: string;
  path: string;
  text: string;
  isTest: boolean;
}

/** Conjunto de roles declarado en el código (enum Rol, union type, enum de Prisma…). */
export interface RoleSet extends CodeRef {
  name: string;
  values: string[];
}

/** Enumeración de negocio que no es de roles (sirve al glosario: TipoIncidencia = Reclamo, Novedad). */
export interface EnumInfo extends CodeRef {
  name: string;
  values: string[];
}

/** Regla de acceso declarada: atributo, decorador, middleware o política. */
export interface AuthRule extends CodeRef {
  /** A qué aplica: ruta, controlador, método o nombre de política. */
  target: string;
  roles: string[];
  policy?: string;
  claim?: string;
  anonymous?: boolean;
  /** Cómo se declaró: «[Authorize]», «@Roles», «requireRole()», «AddPolicy»… */
  via: string;
}

export interface Endpoint extends CodeRef {
  method: string;
  route: string;
  roles: string[];
  policy?: string;
  anonymous?: boolean;
  /** true si se declara alguna autorización (roles, política o [Authorize] solo). */
  authorized: boolean;
}

export interface EntityInfo extends CodeRef {
  name: string;
  source: "ef-dbset" | "clase" | "prisma" | "typeorm" | "mongoose";
  table?: string;
  fields: string[];
  abstract?: boolean;
  base?: string;
}

/** Cómo se crea o cambia el esquema: EnsureCreated, Migrate, carpeta de migraciones, scripts SQL… */
export interface SchemaMechanism extends CodeRef {
  mechanism: string;
  detail: string;
}

export interface ConfigKey extends CodeRef {
  key: string;
}

export interface I18nEntry extends CodeRef {
  locale: string;
  key: string;
  value: string;
}

/** Textos visibles de una pantalla (para relacionar el lenguaje de la UI con el código). */
export interface ScreenText extends CodeRef {
  texts: string[];
}

export interface TestSummary {
  repo: string;
  testFiles: number;
  projects: string[];
  frameworks: string[];
}

export type CodeTrapKind = "seguridad" | "entorno" | "decision" | "permisos-distintos" | "sin-autorizacion";

export interface CodeTrap extends CodeRef {
  kind: CodeTrapKind;
  text: string;
}

/** Cómo decide los permisos cada repo. */
export interface PermissionModel extends CodeRef {
  model: "por-rol" | "por-claims" | "por-politica";
  detail: string;
}

export interface CodeFacts {
  roleSets: RoleSet[];
  enums: EnumInfo[];
  auth: AuthRule[];
  endpoints: Endpoint[];
  entities: EntityInfo[];
  schema: SchemaMechanism[];
  configKeys: ConfigKey[];
  i18n: I18nEntry[];
  screens: ScreenText[];
  tests: TestSummary[];
  traps: CodeTrap[];
  permissionModels: PermissionModel[];
  /** Autorización global (filtro, FallbackPolicy, APP_GUARD, app.use(auth)) por repo. */
  globalAuth: CodeRef[];
  filesRead: number;
  filesNotRead: number;
}

export function emptyCodeFacts(): CodeFacts {
  return {
    roleSets: [],
    enums: [],
    auth: [],
    endpoints: [],
    entities: [],
    schema: [],
    configKeys: [],
    i18n: [],
    screens: [],
    tests: [],
    traps: [],
    permissionModels: [],
    globalAuth: [],
    filesRead: 0,
    filesNotRead: 0
  };
}
