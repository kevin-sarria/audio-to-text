import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startDesktopServer, DesktopServerInstance } from "../server.js";
import { InMemorySecretVault } from "../infrastructure/settings/ISecretVault.js";

describe("Biblioteca en el servidor de escritorio", () => {
  let tempDir: string;
  let server: DesktopServerInstance;
  const launchToken = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "library-server-test-"));
    server = await startDesktopServer({
      userDataDir: tempDir,
      resourcesDir: tempDir,
      vault: new InMemorySecretVault(),
      launchToken,
      botEngine: {
        start: async () => "s",
        finalize: async () => ({ utterances: 0, deliveryFile: null }),
        abort: async () => {}
      },
      locateBrowser: () => "C:/brave.exe",
      browserDisplayName: () => "Brave",
      probeAccount: async () => ({ url: "https://myaccount.google.com/", text: "" }),
      killBotBrowser: () => {},
      port: 0
    });
  });

  afterEach(async () => {
    await server.close();
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("las rutas de la biblioteca exigen la cookie local y responden con ella", async () => {
    const url = `http://127.0.0.1:${server.port}/api/desktop/library/sessions`;

    expect((await fetch(url)).status).toBe(401);

    const ok = await fetch(url, { headers: { Cookie: `accessToken=${launchToken}` } });
    expect(ok.status).toBe(200);
    const json = (await ok.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    const imp = await fetch(`http://127.0.0.1:${server.port}/api/desktop/library/import`, {
      method: "POST",
      headers: { Cookie: `accessToken=${launchToken}` }
    });
    expect(imp.status).toBe(200);
    const impJson = (await imp.json()) as any;
    expect(impJson.data).toHaveProperty("imported");
    expect(impJson.data).toHaveProperty("folderMissing");
  });
});
