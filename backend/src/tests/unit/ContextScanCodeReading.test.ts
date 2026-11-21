import { describe, it, expect } from "vitest";
import { extractFromFile, crossRepoFacts } from "../../infrastructure/analysis/contextScan/code/collectCodeFacts.js";
import { CodeFacts, emptyCodeFacts } from "../../infrastructure/analysis/contextScan/code/types.js";
import { localeOf } from "../../infrastructure/analysis/contextScan/code/i18nExtractor.js";
import { describeCodeForPrompt, codeBlockFor } from "../../infrastructure/analysis/contextScan/code/describeCode.js";
import { codeFilePriority, isCodeScanFile, isTestFile } from "../../infrastructure/analysis/contextScan/inventory/codeFiles.js";

/** Pasa uno o varios archivos por los extractores, como lo hace el escáner. */
function extract(files: Array<{ path: string; text: string; repo?: string }>): CodeFacts {
  const facts = emptyCodeFacts();
  for (const f of files) extractFromFile({ repo: f.repo ?? "api", path: f.path, text: f.text, isTest: false }, facts);
  return facts;
}

describe("Qué archivos de código se leen y en qué orden", () => {
  it("lee código, Prisma, .resx y JSON de traducciones; no generado, migraciones ni dist", () => {
    expect(isCodeScanFile("src/Controllers/UsersController.cs", 100)).toBe(true);
    expect(isCodeScanFile("prisma/schema.prisma", 100)).toBe(true);
    expect(isCodeScanFile("src/locales/es.json", 100)).toBe(true);
    expect(isCodeScanFile("Resources/Strings.es.resx", 100)).toBe(true);
    expect(isCodeScanFile("package.json", 100)).toBe(false);
    expect(isCodeScanFile("src/types.d.ts", 100)).toBe(false);
    expect(isCodeScanFile("Data/Migrations/20240101_Init.cs", 100)).toBe(false);
    expect(isCodeScanFile("dist/main.js", 100)).toBe(false);
  });

  it("prioriza acceso y arranque; «controller» no se confunde con «rol»", () => {
    expect(codeFilePriority("src/auth/permisosPanel.ts")).toBe(1);
    expect(codeFilePriority("src/guards/RolesGuard.ts")).toBe(1);
    expect(codeFilePriority("Program.cs")).toBe(2);
    expect(codeFilePriority("Controllers/OrdersController.cs")).toBe(3);
    expect(codeFilePriority("tests/Api.Tests/OrdersTests.cs")).toBe(9);
    expect(isTestFile("src/app.spec.ts")).toBe(true);
    expect(isTestFile("src/app.ts")).toBe(false);
  });
});

describe(".NET: controladores, [Authorize], minimal APIs, políticas, entidades y esquema", () => {
  const controller = `
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin,Manager")]
public class OrdersController : ControllerBase
{
    [HttpGet("{id}")]
    public IActionResult Get(int id) => Ok();

    [HttpPost]
    [Authorize(Policy = "CanApprove")]
    public IActionResult Approve() => Ok();

    [AllowAnonymous]
    [HttpGet("public")]
    public IActionResult Public() => Ok();
}`;

  it("arma la ruta con [controller] y hereda los roles de la clase", () => {
    const f = extract([{ path: "Controllers/OrdersController.cs", text: controller }]);
    expect(f.endpoints.map((e) => `${e.method} ${e.route}`)).toEqual(["GET api/Orders/{id}", "POST api/Orders", "GET api/Orders/public"]);
    expect(f.endpoints[0]).toMatchObject({ roles: ["Admin", "Manager"], authorized: true });
    expect(f.endpoints[1]).toMatchObject({ policy: "CanApprove" });
    expect(f.endpoints[2]).toMatchObject({ anonymous: true, authorized: false });
    expect(f.auth[0]).toMatchObject({ target: "api/Orders", roles: ["Admin", "Manager"], via: "[Authorize]" });
  });

  it("lee minimal APIs, AddPolicy con RequireRole, enum de roles, DbSet, clases de dominio y EnsureCreated", () => {
    const program = `
builder.Services.AddAuthorization(o => {
    o.AddPolicy("SoloAdmin", p => p.RequireRole("Admin"));
});
app.MapGet("/health", () => "ok").AllowAnonymous();
app.MapPost("/orders", Create).RequireAuthorization("SoloAdmin");
db.Database.EnsureCreated();`;
    const f = extract([
      { path: "Program.cs", text: program },
      { path: "Domain/Role.cs", text: "public enum Role { Admin = 1, Clerk = 2 }" },
      { path: "Data/AppDbContext.cs", text: "public DbSet<Order> Orders { get; set; }" },
      { path: "Domain/Entities/Order.cs", text: "public class Order : BaseEntity\n{\n    public int Id { get; set; }\n    public string Number { get; set; }\n}" }
    ]);
    expect(f.auth.find((a) => a.via === "AddPolicy")).toMatchObject({ policy: "SoloAdmin", roles: ["Admin"] });
    expect(f.endpoints.find((e) => e.route === "/orders")).toMatchObject({ method: "POST", policy: "SoloAdmin", authorized: true });
    expect(f.endpoints.find((e) => e.route === "/health")).toMatchObject({ anonymous: true });
    expect(f.roleSets[0]).toMatchObject({ name: "Role", values: ["Admin", "Clerk"] });
    expect(f.entities.find((e) => e.name === "Order")).toMatchObject({ source: "ef-dbset", table: "Orders", fields: ["Id", "Number"] });
    expect(f.schema[0]!.mechanism).toBe("EnsureCreated");
  });
});

describe("TypeScript: Express, Nest, roles, TypeORM, React", () => {
  it("Express: rutas con el middleware de rol", () => {
    const f = extract([
      {
        path: "src/routes/users.ts",
        text: `router.get('/users', requireAuth, requireRole('admin', 'auditor'), list);\nrouter.post('/login', login);`
      }
    ]);
    expect(f.endpoints[0]).toMatchObject({ method: "GET", route: "/users", roles: ["admin", "auditor"], authorized: true });
    expect(f.endpoints[1]).toMatchObject({ method: "POST", route: "/login", authorized: false });
    expect(f.auth[0]).toMatchObject({ roles: ["admin", "auditor"], via: "requireRole()" });
  });

  it("Nest: @Controller + @Get con @Roles de clase y @Public de método", () => {
    const f = extract([
      {
        path: "src/users/users.controller.ts",
        text: `@Controller('users')\n@Roles(Role.Admin)\nexport class UsersController {\n  @Get(':id')\n  find() {}\n\n  @Public()\n  @Get('count')\n  count() {}\n}`
      }
    ]);
    expect(f.endpoints.map((e) => e.route)).toEqual(["users/:id", "users/count"]);
    expect(f.endpoints[0]).toMatchObject({ roles: ["Admin"], authorized: true });
    expect(f.endpoints[1]).toMatchObject({ anonymous: true });
  });

  it("roles como enum o union type; entidades de TypeORM; rutas y textos de pantallas React", () => {
    const f = extract([
      { path: "src/auth/roles.ts", text: `export type UserRole = 'admin' | 'seller';` },
      { path: "src/entities/user.entity.ts", text: `@Entity('users')\nexport class User {\n  @PrimaryGeneratedColumn() id: number;\n  @Column() email: string;\n}` },
      { path: "src/App.tsx", text: `<Route path="/sedes" element={<SedesPage />} />` },
      { path: "src/pages/SedesPage.tsx", text: `export const SedesPage = () => <h1>Sedes</h1>;` }
    ]);
    expect(f.roleSets[0]).toMatchObject({ name: "UserRole", values: ["admin", "seller"] });
    expect(f.entities[0]).toMatchObject({ name: "User", source: "typeorm", table: "users", fields: ["id", "email"] });
    expect(f.endpoints[0]).toMatchObject({ method: "PANTALLA", route: "/sedes → SedesPage" });
    expect(f.screens[0]).toMatchObject({ path: "src/pages/SedesPage.tsx", texts: ["Sedes"] });
  });
});

describe("Prisma e i18n", () => {
  it("Prisma: modelos con @@map, enum de roles y proveedor", () => {
    const schema = `datasource db {\n  provider = "postgresql"\n}\n\nmodel Branch {\n  id   Int    @id\n  name String\n  @@map("sedes")\n}\n\nenum Role {\n  ADMIN\n  USER\n}`;
    const f = extract([{ path: "prisma/schema.prisma", text: schema }]);
    expect(f.entities[0]).toMatchObject({ name: "Branch", table: "sedes", fields: ["id", "name"] });
    expect(f.roleSets[0]).toMatchObject({ name: "Role", values: ["ADMIN", "USER"] });
    expect(f.schema[0]!.mechanism).toBe("Prisma");
  });

  it("JSON anidado y .resx, con el idioma sacado del nombre o de la carpeta", () => {
    const f = extract([
      { path: "web/src/locales/es-CO.json", text: JSON.stringify({ menu: { branches: "Sedes" } }, null, 2) },
      { path: "Api/Resources/Labels.es.resx", text: `<root>\n  <data name="CostCenter" xml:space="preserve">\n    <value>Sede</value>\n  </data>\n</root>` }
    ]);
    expect(f.i18n.map((e) => `${e.locale} ${e.key}=${e.value}`)).toEqual(["es-CO menu.branches=Sedes", "es CostCenter=Sede"]);
    expect(localeOf("public/locales/en/translation.json")).toBe("en");
  });
});

describe("Señales del código: seguridad, entorno, decisiones, configuración y permisos", () => {
  it("agrupa los ajustes de seguridad cercanos con su comentario", () => {
    const f = extract([
      {
        path: "Program.cs",
        text: `// Tres intentos y la cuenta queda bloqueada media hora\noptions.Lockout.MaxFailedAccessAttempts = 3;\noptions.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(30);`
      }
    ]);
    const trap = f.traps.find((t) => t.kind === "seguridad")!;
    expect(trap.line).toBe(2);
    expect(trap.text).toContain("Tres intentos y la cuenta queda bloqueada media hora");
    expect(trap.text).toContain("MaxFailedAccessAttempts = 3");
    expect(trap.text).toContain("FromMinutes(30)");
  });

  it("anota las ramas por entorno, pero no la plantilla de Swagger", () => {
    const f = extract([
      {
        path: "Services/Mailer.cs",
        text: `if (app.Environment.IsDevelopment())\n{\n    app.UseSwagger();\n}\n// En producción el correo sale por SES\nvar sender = env.IsProduction() ? "ses" : "smtp-local";`
      }
    ]);
    const env = f.traps.filter((t) => t.kind === "entorno");
    expect(env).toHaveLength(1);
    expect(env[0]!.text).toContain("En producción el correo sale por SES");
  });

  it("toma comentarios de decisión y no TODOs ni código comentado", () => {
    const f = extract([
      {
        path: "src/sync.ts",
        text: `// TODO: no usar esto nunca más\n// const x = old();\n// Se guarda en SQLite en vez de llamar a la API: la app debe funcionar sin conexión\nexport function save() {}`
      }
    ]);
    const decisions = f.traps.filter((t) => t.kind === "decision");
    expect(decisions.map((d) => d.line)).toEqual([3]);
  });

  it("solo guarda el NOMBRE de las claves de configuración, nunca el valor", () => {
    const f = extract([{ path: "src/db.ts", text: `const url = process.env.DATABASE_URL ?? "postgres://user:clave@host/db";` }]);
    expect(f.configKeys.map((k) => k.key)).toEqual(["DATABASE_URL"]);
    expect(describeCodeForPrompt(f, 5000)).not.toContain("clave@host");
  });

  it("detecta repos que deciden los permisos de forma distinta y endpoints sin autorización", () => {
    const f = extract([
      { repo: "web", path: "web/src/auth/perms.ts", text: `export const ROLE_PERMISSIONS = { admin: ["x.read"] };` },
      { repo: "mobile", path: "mobile/src/auth/caps.ts", text: `const caps = decoded.scopes.split(" ");` },
      {
        repo: "api",
        path: "api/Controllers/ItemsController.cs",
        text: `[Route("api/items")]\npublic class ItemsController : ControllerBase\n{\n    [HttpGet]\n    [Authorize]\n    public IActionResult List() => Ok();\n\n    [HttpDelete("{id}")]\n    public IActionResult Delete(int id) => Ok();\n}`
      }
    ]);
    f.traps.push({ repo: "mobile", path: "mobile/src/auth/caps.ts", line: 1, kind: "decision", text: "La app NO usa la lista por rol: usa los scopes del token" });
    crossRepoFacts(f);
    expect(f.permissionModels.map((p) => `${p.repo}:${p.model}`).sort()).toEqual(["mobile:por-claims", "web:por-rol"]);
    // El comentario que decía lo mismo queda cubierto por la trampa de permisos distintos.
    expect(f.traps.some((t) => t.kind === "decision")).toBe(false);
    const divergence = f.traps.find((t) => t.kind === "permisos-distintos")!;
    expect(divergence.text).toContain("`mobile` por claims del token (`scopes`)");
    expect(divergence.text).toContain("`web` por rol, con una lista fija (`ROLE_PERMISSIONS`)");
    const open = f.traps.find((t) => t.kind === "sin-autorizacion")!;
    expect(open.text).toContain("DELETE api/items/{id}");
  });

  it("una autorización global evita la alarma de endpoints sin autorización", () => {
    const f = extract([
      { path: "Program.cs", text: "app.MapControllers().RequireAuthorization();" },
      { path: "Controllers/AController.cs", text: `[Route("a")]\npublic class AController : ControllerBase\n{\n    [HttpGet]\n    [Authorize(Roles = "X")]\n    public IActionResult L() => Ok();\n    [HttpPost]\n    public IActionResult P() => Ok();\n}` }
    ]);
    crossRepoFacts(f);
    expect(f.globalAuth).toHaveLength(1);
    expect(f.traps.some((t) => t.kind === "sin-autorizacion")).toBe(false);
  });
});

describe("Bloques de texto", () => {
  it("el contexto lleva roles, esquema y pruebas «Del código»", () => {
    const f = extract([
      { path: "Domain/Rol.cs", text: "public enum Rol { Administrador, Tecnico }" },
      { path: "Program.cs", text: "db.Database.Migrate();" }
    ]);
    f.tests.push({ repo: "api", testFiles: 0, projects: ["api/Api.Tests/Api.Tests.csproj"], frameworks: ["xunit"] });
    expect(codeBlockFor("roles_permisos", f)[0]).toBe("- Roles `Rol`: Administrador, Tecnico (fuente: Domain/Rol.cs:1)");
    expect(codeBlockFor("cambios_base_datos", f)[0]).toContain("Database.Migrate");
    expect(codeBlockFor("verificacion", f)[0]).toBe("- `api`: 1 proyecto(s) de pruebas (api/Api.Tests/Api.Tests.csproj); framework: xunit; 0 archivo(s) de prueba");
  });

  it("si el bloque del prompt no cabe, recorta primero la configuración y avisa cuántas líneas quitó", () => {
    const f = emptyCodeFacts();
    for (let i = 0; i < 200; i++) f.configKeys.push({ repo: `r${i}`, path: `r${i}/a.ts`, line: 1, key: `KEY_${i}` });
    f.traps.push({ repo: "api", path: "Program.cs", line: 3, kind: "seguridad", text: "código: `MaxFailedAccessAttempts = 5`" });
    const text = describeCodeForPrompt(f, 2000);
    expect(text.length).toBeLessThanOrEqual(2200);
    expect(text).toContain("MaxFailedAccessAttempts = 5");
    expect(text).toMatch(/… \(\d+ más sin mostrar\)/);
  });
});
