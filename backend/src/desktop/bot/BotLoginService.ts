import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";
import type { BotLoginCheckDto } from "@audio-to-text/shared";
import type { BotPaths } from "./BotPaths.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ACCOUNT_HOST = "myaccount.google.com";

/**
 * Decide si la página de cuenta de Google corresponde a una sesión iniciada.
 * Solo cuenta como vinculada una página en myaccount.google.com (host exacto) con un correo visible.
 * Cualquier otra URL (login, dominio parecido, no parseable) no está vinculada.
 */
export function interpretAccountPage(url: string, text: string): { linked: boolean; email: string | null } {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { linked: false, email: null };
  }
  if (host !== ACCOUNT_HOST) return { linked: false, email: null };
  const email = text.match(EMAIL_RE)?.[0] ?? null;
  return email ? { linked: true, email } : { linked: false, email: null };
}

export interface AccountProbeInput {
  profileDir: string;
  browserPath: string;
}

export interface BotLoginDeps {
  paths: BotPaths;
  getPreferredBrowser: () => string;
  locateBrowser: (preferred: string) => string;
  displayName: (browserPath: string) => string;
  /** Abre el perfil sin ventana, entra a myaccount.google.com y devuelve URL final y texto. */
  probeAccount: (input: AccountProbeInput) => Promise<{ url: string; text: string }>;
  spawn?: typeof childProcess.spawn;
  /** Cierra cualquier navegador que use el perfil del bot (libera el bloqueo del perfil). */
  killBotBrowser?: () => void;
  exists?: (p: string) => boolean;
  /** Borra una entrada del perfil. Inyectable para probar fallos de borrado. */
  rm?: (p: string) => void;
}

export class BotLoginService {
  private last: BotLoginCheckDto | null = null;
  private pendingVerify: Promise<BotLoginCheckDto> | null = null;

  constructor(private deps: BotLoginDeps) {}

  /** Hay una verificación de sesión en curso (usa el perfil del bot). */
  public isVerifying(): boolean {
    return this.pendingVerify !== null;
  }

  public lastCheck(): BotLoginCheckDto | null {
    return this.last;
  }

  public browserInfo(): { name: string; path: string } {
    const p = this.deps.locateBrowser(this.deps.getPreferredBrowser());
    return { name: this.deps.displayName(p), path: p };
  }

  /** Abre el navegador visible con el perfil del bot para que el usuario inicie sesión. */
  public openLoginBrowser(): { success: boolean; message: string } {
    const exists = this.deps.exists ?? fs.existsSync;
    const info = this.browserInfo();
    if (!exists(info.path)) {
      throw new Error(`No se encontró el navegador (${info.name}). Instala Chrome, Edge o Brave, o elige otro en Ajustes.`);
    }
    fs.mkdirSync(this.deps.paths.profileDir, { recursive: true });
    this.deps.killBotBrowser?.();

    const spawn = this.deps.spawn ?? childProcess.spawn;
    const child = spawn(
      info.path,
      [`--user-data-dir=${this.deps.paths.profileDir}`, "--no-first-run", "--no-default-browser-check", "https://accounts.google.com"],
      { detached: true, stdio: "ignore" }
    );
    // Un fallo asíncrono del spawn (ENOENT/EACCES tras el exists) no debe tumbar el backend.
    child.on("error", (err) => console.warn("[BotLogin] no se pudo abrir el navegador del bot:", err));
    child.unref();
    this.last = null;
    return {
      success: true,
      message: `Se abrió ${info.name}. Inicia sesión con la cuenta de Google del bot, ciérralo y pulsa "Verificar sesión".`
    };
  }

  /** Comprueba de verdad si el perfil tiene una sesión de Google iniciada. Dos llamadas simultáneas comparten la misma comprobación. */
  public verify(): Promise<BotLoginCheckDto> {
    if (!this.pendingVerify) {
      this.pendingVerify = this.runVerify().finally(() => {
        this.pendingVerify = null;
      });
    }
    return this.pendingVerify;
  }

  private async runVerify(): Promise<BotLoginCheckDto> {
    try {
      this.deps.killBotBrowser?.();
      const info = this.browserInfo();
      const page = await this.deps.probeAccount({ profileDir: this.deps.paths.profileDir, browserPath: info.path });
      const { linked, email } = interpretAccountPage(page.url, page.text);
      this.last = linked
        ? { linked: true, email, message: `Sesión de Google activa${email ? ` (${email})` : ""}.` }
        : { linked: false, email: null, message: "No hay una sesión de Google iniciada. Inicia sesión con el botón de arriba." };
    } catch (err) {
      this.last = {
        linked: false,
        email: null,
        message: `No se pudo verificar la sesión: ${err instanceof Error ? err.message : String(err)}`
      };
    }
    return this.last;
  }

  /** Borra el perfil del bot. Solo es éxito si el perfil quedó vacío; si algo está en uso, conserva la verificación previa. */
  public unlink(): { success: boolean; message: string } {
    this.deps.killBotBrowser?.();
    const dir = this.deps.paths.profileDir;
    const rm = this.deps.rm ?? ((p: string) => fs.rmSync(p, { recursive: true, force: true }));
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir)) {
      try {
        rm(path.join(dir, entry));
      } catch {
        /* se comprueba al final si quedó algo; un archivo bloqueado no impide intentar el resto */
      }
    }
    if (fs.readdirSync(dir).length > 0) {
      return {
        success: false,
        message: "No se pudo eliminar toda la sesión (archivos en uso). Cierra el navegador del bot e inténtalo de nuevo."
      };
    }
    this.last = null;
    return { success: true, message: "Sesión de Google del bot eliminada." };
  }
}
