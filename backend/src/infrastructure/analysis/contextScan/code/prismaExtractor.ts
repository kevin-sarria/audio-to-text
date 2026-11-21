import { CodeFacts, SourceFile } from "./types.js";
import { lineAt } from "./sourceText.js";

/** Prisma: modelos (con @@map a la tabla), enums (los de roles van aparte) y el proveedor. */

const ROLE_ENUM_NAME = /^(?:Rol|Role|Roles|UserRole|UserRoles|Perfil|TipoUsuario|UserType)$/i;

export function extractPrisma(file: SourceFile, facts: CodeFacts): void {
  const text = file.text;
  let m: RegExpExecArray | null;

  const modelRe = /^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm;
  while ((m = modelRe.exec(text)) !== null) {
    const body = m[2]!;
    const fields = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s+/)[0]!)
      .filter((f) => /^\w+$/.test(f))
      .slice(0, 15);
    const table = (body.match(/@@map\s*\(\s*"([^"]+)"/) ?? [])[1];
    facts.entities.push({ repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[1]!, source: "prisma", table, fields });
  }

  const enumRe = /^\s*enum\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm;
  while ((m = enumRe.exec(text)) !== null) {
    const values = m[2]!
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, "").trim().split(/\s+/)[0] ?? "")
      .filter((v) => /^\w+$/.test(v));
    const info = { repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[1]!, values };
    if (ROLE_ENUM_NAME.test(m[1]!)) facts.roleSets.push(info);
    else if (values.length) facts.enums.push(info);
  }

  const provider = text.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/);
  if (provider) {
    facts.schema.push({
      repo: file.repo,
      path: file.path,
      line: lineAt(text, provider.index ?? 0),
      mechanism: "Prisma",
      detail: `esquema definido en ${file.path} (base ${provider[1]}); los cambios se hacen en el schema y se aplican con Prisma`
    });
  }
}
