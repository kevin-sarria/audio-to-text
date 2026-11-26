import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { startDesktopServer, type DesktopServerInstance } from "../server.js";
import { InMemorySecretVault } from "../infrastructure/settings/ISecretVault.js";

describe("cableado del bot en el servidor de escritorio", () => {
  let server: DesktopServerInstance | null = null;
  let dir = "";
  afterEach(async () => {
    await server?.close();
    server = null;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("expone /api/desktop/bot/session con autenticación y estado IDLE", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "botwire-"));
    const events: string[] = [];
    server = await startDesktopServer({
      userDataDir: dir,
      resourcesDir: dir,
      vault: new InMemorySecretVault(),
      launchToken: "tok",
      botEngine: {
        start: async () => "s",
        finalize: async () => ({ utterances: 0, deliveryFile: null }),
        abort: async () => {}
      },
      locateBrowser: () => "C:/brave.exe",
      browserDisplayName: () => "Brave",
      probeAccount: async () => ({ url: "https://myaccount.google.com/", text: "" }),
      closeBotBrowser: async () => "none" as const,
      onBotEvent: (s) => events.push(s.state)
    });
    const base = `http://127.0.0.1:${server.port}/api/desktop/bot`;

    const noAuth = await fetch(`${base}/session`);
    expect(noAuth.status).toBe(401);

    const ok = await fetch(`${base}/session`, { headers: { Cookie: "accessToken=tok" } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).data.state).toBe("IDLE");
    expect(server.bot.isActive()).toBe(false);
  });
});
