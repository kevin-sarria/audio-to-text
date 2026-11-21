import { ManifestInfo } from "../ProjectInventory.js";

/**
 * De las dependencias, solo las que definen la arquitectura: framework, ORM/datos,
 * componentes de UI, estado, rutas, autenticación, pruebas y build. Incluye las
 * devDependencies que cumplan ese criterio (vite, typescript, vitest…).
 */

const CATEGORIES: Array<{ label: string; re: RegExp }> = [
  {
    label: "framework",
    re: /^(react|vue|@angular\/core|next|nuxt|svelte|@sveltejs\/kit|express|fastify|@nestjs\/core|koa|hono|expo|react-native|electron|django|flask|fastapi|laravel\/framework|rails|spring-boot.*|microsoft\.aspnetcore\.app|microsoft\.aspnetcore\.mvc.*)$/i
  },
  {
    label: "datos",
    re: /^(prisma|@prisma\/client|typeorm|sequelize|mongoose|drizzle-orm|knex|kysely|dapper|sqlalchemy|expo-sqlite|better-sqlite3|pg|mysql2|mongodb|redis|ioredis|microsoft\.entityframeworkcore.*|npgsql.*|pomelo\.entityframeworkcore.*)$/i
  },
  {
    label: "UI",
    re: /^(antd|@ant-design\/.*|@mui\/material|tailwindcss|bootstrap|react-bootstrap|@chakra-ui\/react|primereact|vuetify|element-plus|@mantine\/core|react-native-paper|@radix-ui\/.*|nativewind)$/i
  },
  { label: "estado", re: /^(redux|@reduxjs\/toolkit|zustand|mobx|pinia|vuex|recoil|jotai|@tanstack\/react-query|swr)$/i },
  { label: "rutas", re: /^(react-router-dom|react-router|expo-router|vue-router|@tanstack\/react-router)$/i },
  {
    label: "auth",
    re: /^(jsonwebtoken|jose|passport.*|next-auth|@auth\/.*|firebase|@supabase\/supabase-js|bcrypt.*|argon2|keycloak.*|@azure\/msal.*|microsoft\.aspnetcore\.authentication.*|microsoft\.aspnetcore\.identity.*|system\.identitymodel\.tokens\.jwt)$/i
  },
  {
    label: "pruebas",
    re: /^(vitest|jest|mocha|@playwright\/test|playwright|cypress|@testing-library\/.*|supertest|xunit|nunit|mstest.*|pytest|microsoft\.net\.test\.sdk|moq|fluentassertions)$/i
  },
  { label: "build", re: /^(vite|webpack|typescript|esbuild|turbo|nx|tsx|@vitejs\/plugin-react.*|rollup|parcel)$/i }
];

export function categorizeDependencies(manifest: ManifestInfo): Array<{ label: string; deps: string[] }> {
  const all = { ...manifest.devDependencies, ...manifest.dependencies };
  const result: Array<{ label: string; deps: string[] }> = [];
  for (const cat of CATEGORIES) {
    const deps = Object.entries(all)
      .filter(([name]) => cat.re.test(name))
      .map(([name, ver]) => (ver && ver !== "*" ? `${name}@${ver}` : name));
    if (deps.length) result.push({ label: cat.label, deps: deps.slice(0, 4) });
  }
  return result;
}

/** Una línea por manifiesto: «UI antd@5 · estado zustand@4 · pruebas vitest@2». */
export function renderManifestLine(m: ManifestInfo): string {
  const head = `\`${m.path}\` (${m.kind}${m.name ? `: ${m.name}` : ""}${m.version ? ` v${m.version}` : ""})`;
  const runtime = m.kind === "dotnet" && m.frameworks.length ? `${m.frameworks.join(", ")} · ` : "";
  const cats = categorizeDependencies(m);
  if (cats.length > 0) {
    return `- ${head}: ${runtime}${cats.map((c) => `${c.label} ${c.deps.join(", ")}`).join(" · ")}`;
  }
  const top = Object.entries(m.dependencies).slice(0, 5).map(([n, v]) => (v && v !== "*" ? `${n}@${v}` : n));
  return `- ${head}${runtime || top.length ? `: ${runtime}${top.join(", ")}` : ""}`;
}
