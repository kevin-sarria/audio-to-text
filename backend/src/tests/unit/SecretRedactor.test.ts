import { describe, it, expect } from "vitest";
import { redactSecrets, isProseAssignment } from "../../infrastructure/analysis/contextScan/SecretRedactor.js";

describe("SecretRedactor - Detección y Redacción de Secretos", () => {
  it("redacta bloques de private-key", () => {
    const raw = `
Clave privada del servidor:
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1234567890abcdef
-----END RSA PRIVATE KEY-----
`;
    const res = redactSecrets(raw);
    expect(res.text).toContain("[REDACTADO:private-key]");
    expect(res.text).not.toContain("MIIEowIBAAKCAQEA0Y1234567890abcdef");
    expect(res.byType["private-key"]).toBe(1);
  });

  it("redacta connection strings en URI y en formato ADO", () => {
    const rawUri = "DATABASE_URL=postgres://miusuario:miclavesecreta123@db.prod.internal:5432/produccion";
    const resUri = redactSecrets(rawUri);
    expect(resUri.text).toContain("postgres://[REDACTADO:connection-string]@db.prod.internal:5432/produccion");
    expect(resUri.text).not.toContain("miclavesecreta123");

    const rawAdo = `
{
  "ConnectionStrings": {
    "Db": "Server=192.168.1.50;Database=Fin;User Id=sa;Password=ClaveAdo999;"
  }
}
`;
    const resAdo = redactSecrets(rawAdo);
    expect(resAdo.text).toContain("[REDACTADO:connection-string]");
    expect(resAdo.text).not.toContain("ClaveAdo999");
  });

  it("redacta api-keys de diversos proveedores (OpenAI, Anthropic, Google, GitHub, Slack, AWS)", () => {
    const raw = `
openai: sk-abcdefghijklmnopqrstuvwxyz1234567890
anthropic: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234
google: AIzaSyD1234567890abcdefghijklmnopqrstuvw
github: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB
slack: xoxb-1234567890-abcdefghij
aws: AKIAIOSFODNN7EXAMPLE
`;
    const res = redactSecrets(raw);
    expect(res.text).not.toContain("sk-abcdefghijklmnop");
    expect(res.text).not.toContain("sk-ant-api03");
    expect(res.text).not.toContain("AIzaSyD12345678");
    expect(res.text).not.toContain("ghp_1234567890");
    expect(res.text).not.toContain("xoxb-1234567890");
    expect(res.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(res.byType["api-key"]).toBeGreaterThanOrEqual(6);
  });

  it("redacta tokens JWT completos", () => {
    const raw = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const res = redactSecrets(raw);
    expect(res.text).toContain("Authorization: Bearer [REDACTADO:jwt]");
    expect(res.text).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });

  it("redacta asignaciones de credenciales ignorando placeholders", () => {
    const rawConSecretos = `
api_key = mi_secreto_real_9876
client_secret: "prod_secret_token_12345"
`;
    const res1 = redactSecrets(rawConSecretos);
    expect(res1.text).toContain("api_key = [REDACTADO:assignment]");
    expect(res1.text).toContain('client_secret: "[REDACTADO:assignment]"');

    const rawConPlaceholders = `
password = ""
api_key = <TU_API_KEY>
token: \${API_TOKEN}
secret: your-client-secret
passwd: xxx
pwd = changeme
auth_token: CHANGE_ME
secret_key: ***
`;
    const res2 = redactSecrets(rawConPlaceholders);
    expect(res2.text).toContain("<TU_API_KEY>");
    expect(res2.text).toContain("${API_TOKEN}");
    expect(res2.text).toContain("your-client-secret");
    expect(res2.text).toContain("xxx");
    expect(res2.text).toContain("changeme");
    expect(res2.text).toContain("CHANGE_ME");
    expect(res2.text).toContain("***");
    expect(res2.redactions).toBe(0);
  });

  it("redacta direcciones IPv4 reales pero ignora 127.0.0.1, 0.0.0.0 y versiones como 1.2.3.4", () => {
    const raw = `
Host local: 127.0.0.1
Bind: 0.0.0.0
Broadcast: 255.255.255.255
Servidor externo: 198.51.100.45
Version libreria: v1.2.3.4
Version semver: "version": "1.2.3.4"
Version prefijo: 2.3.4.5-beta
`;
    const res = redactSecrets(raw);
    expect(res.text).toContain("127.0.0.1");
    expect(res.text).toContain("0.0.0.0");
    expect(res.text).toContain("255.255.255.255");
    expect(res.text).toContain("v1.2.3.4");
    expect(res.text).toContain('"version": "1.2.3.4"');
    expect(res.text).toContain("2.3.4.5-beta");
    expect(res.text).toContain("Servidor externo: [REDACTADO:ip]");
  });

  it("redacta cuentas cloud (AWS ARN y Azure Subscription)", () => {
    const raw = `
AWS: arn:aws:iam::123456789012:role/DeployRole
Azure: /subscriptions/11112222-3333-4444-5555-666677778888/resourceGroups/rg1
`;
    const res = redactSecrets(raw);
    expect(res.text).toContain("arn:aws:iam::[REDACTADO:cloud-account]:role/DeployRole");
    expect(res.text).toContain("/subscriptions/[REDACTADO:cloud-account]/resourceGroups/rg1");
  });

  it("redacta emails reales pero ignora example.com, localhost y noreply", () => {
    const raw = `
Admin: admin.real@empresa-privada.com
Soporte prueba: dev@example.com
Doc prueba: test@example.org
Interno: alert@localhost
Automático: noreply@servicios.net
Notificaciones: no-reply@otrodominio.com
`;
    const res = redactSecrets(raw);
    expect(res.text).toContain("Admin: [REDACTADO:email]");
    expect(res.text).toContain("dev@example.com");
    expect(res.text).toContain("test@example.org");
    expect(res.text).toContain("alert@localhost");
    expect(res.text).toContain("noreply@servicios.net");
    expect(res.text).toContain("no-reply@otrodominio.com");
  });

  it("es idempotente ante múltiples pasadas", () => {
    const raw = "sk-abcdefghijklmnopqrstuvwxyz1234567890 y postgres://user:pass@host/db";
    const res1 = redactSecrets(raw);
    const res2 = redactSecrets(res1.text);
    expect(res2.text).toBe(res1.text);
    expect(res2.redactions).toBe(0);
  });

  it("no tapa prosa con «del token:» pero sí asignaciones reales", () => {
    // 1. No se redactan casos de prosa (redactions === 0)
    const casoProsa1 =
      'calcula capacidades a partir del claim "cap" del token: «La app NO usa la lista por rol del panel»';
    const resProsa1 = redactSecrets(casoProsa1);
    expect(resProsa1.text).toBe(casoProsa1);
    expect(resProsa1.redactions).toBe(0);

    const casoProsa2 = "the token: is sent in the Authorization header";
    const resProsa2 = redactSecrets(casoProsa2);
    expect(resProsa2.text).toBe(casoProsa2);
    expect(resProsa2.redactions).toBe(0);

    // 2. Se siguen redactando asignaciones reales aunque lleven artículo
    const resPass1 = redactSecrets("el password: MiClave2024!");
    expect(resPass1.text).toBe("el password: [REDACTADO:assignment]");
    expect(resPass1.redactions).toBe(1);

    const resToken = redactSecrets("token: abc123def456");
    expect(resToken.text).toBe("token: [REDACTADO:assignment]");
    expect(resToken.redactions).toBe(1);

    const resPass2 = redactSecrets("la password = hunter2");
    expect(resPass2.text).toBe("la password = [REDACTADO:assignment]");
    expect(resPass2.redactions).toBe(1);

    const resApiKey = redactSecrets("api_key = mi_secreto_real_9876");
    expect(resApiKey.text).toBe("api_key = [REDACTADO:assignment]");
    expect(resApiKey.redactions).toBe(1);

    // 3. API key y JWT se siguen tapando aunque estén en prosa (por sus pasos previos)
    const resApiKeyEnProsa = redactSecrets("del token: sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    expect(resApiKeyEnProsa.text).toBe("del token: [REDACTADO:api-key]");
    expect(resApiKeyEnProsa.byType["api-key"]).toBe(1);

    const resJwtEnProsa = redactSecrets(
      "del token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c explicado en el documento"
    );
    expect(resJwtEnProsa.text).toContain("del token: [REDACTADO:jwt]");
    expect(resJwtEnProsa.byType["jwt"]).toBe(1);

    // 4. Pruebas directas de isProseAssignment
    expect(isProseAssignment("del ", "uno dos tres")).toBe(true);
    expect(isProseAssignment("del ", "uno")).toBe(false);
    expect(isProseAssignment("", "uno dos tres cuatro cinco")).toBe(false);
    expect(isProseAssignment("la casa y ", "uno dos tres cuatro cinco")).toBe(false);
    expect(isProseAssignment("la casa y token: ", "uno dos tres cuatro cinco")).toBe(false);

    // 5. Idempotencia ante prosa
    const primeraPasada = redactSecrets(casoProsa1);
    const segundaPasada = redactSecrets(primeraPasada.text);
    expect(segundaPasada.text).toBe(casoProsa1);
    expect(segundaPasada.redactions).toBe(0);
  });
});

describe("isSecretFile: código fuente con 'secret' en el nombre", async () => {
  const { isSecretFile } = await import("../../infrastructure/analysis/contextScan/ScanIgnore.js");
  it("no marca como secreto el código (SecretVault.ts), sí los datos (client_secret.json, secrets.yaml)", () => {
    expect(isSecretFile("src/settings/ISecretVault.ts")).toBe(false);
    expect(isSecretFile("app/secret_manager.py")).toBe(false);
    expect(isSecretFile("config/client_secret.json")).toBe(true);
    expect(isSecretFile("k8s/secrets.yaml")).toBe(true);
    expect(isSecretFile("config/secrets.example.yaml")).toBe(false);
    expect(isSecretFile("backend-api/appsettings.Development.json")).toBe(true);
    expect(isSecretFile("backend-api/appsettings.Template.json")).toBe(false);
  });
});
