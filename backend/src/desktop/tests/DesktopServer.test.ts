import http from "node:http";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startDesktopServer, DesktopServerInstance } from "../server.js";
import { InMemorySecretVault } from "../infrastructure/settings/ISecretVault.js";

describe("DesktopServer", () => {
  let tempDir: string;
  let staticDir: string;
  let serverInstance: DesktopServerInstance;
  const launchToken = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "desktop-server-test-"));
    staticDir = path.join(tempDir, "frontend-dist");
    await fsp.mkdir(staticDir, { recursive: true });
    await fsp.writeFile(
      path.join(staticDir, "index.html"),
      "<!DOCTYPE html><html><body><h1>Audio2Text Test</h1></body></html>"
    );

    const vault = new InMemorySecretVault();
    serverInstance = await startDesktopServer({
      userDataDir: tempDir,
      resourcesDir: tempDir,
      vault,
      launchToken,
      port: 0
    });
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("responde 200 en /api/health sin requerir cookie de autenticación", async () => {
    const res = await fetch(`http://127.0.0.1:${serverInstance.port}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.status).toBe("ok");
  });

  it("responde 401 en /api/sessions si no se envía la cookie accessToken", async () => {
    const res = await fetch(`http://127.0.0.1:${serverInstance.port}/api/sessions`);
    expect(res.status).toBe(401);
  });

  it("responde 403 si la cabecera Host no coincide con las permitidas (anti DNS-rebinding)", async () => {
    // fetch (undici) ignora la cabecera Host, así que se usa http.request para forzarla
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: serverInstance.port,
          path: "/api/health",
          method: "GET",
          headers: { Host: "evil-site.attacker.com" }
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on("error", reject);
      req.end();
    });
    const res = { status };
    expect(res.status).toBe(403);
  });

  it("rechaza con 403 una petición con Origin ajeno y acepta el del propio servidor", async () => {
    const base = `http://127.0.0.1:${serverInstance.port}`;
    const evil = await fetch(`${base}/api/health`, { headers: { Origin: "https://evil-site.attacker.com" } });
    expect(evil.status).toBe(403);
    const own = await fetch(`${base}/api/health`, { headers: { Origin: base } });
    expect(own.status).toBe(200);
  });

  it("sirve index.html en la raíz /", async () => {
    const res = await fetch(`http://127.0.0.1:${serverInstance.port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Audio2Text Test");
  });
});
