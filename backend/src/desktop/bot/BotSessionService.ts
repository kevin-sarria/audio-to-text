import path from "node:path";
import {
  BOT_PLATFORMS,
  DEFAULT_BOT_ALLOWED_DOMAINS,
  type BotPlatform,
  type BotSessionDto,
  type BotSessionState,
  type ImportBotMeetingsResultDto,
  type MeetingBotConfigDto
} from "@audio-to-text/shared";
import { checkMeetingUrl } from "./meetingUrlPolicy.js";

export type EndReason = "USER" | "LEFT_ROOM" | "MEETING_ENDED_TEXT" | "BROWSER_CLOSED" | "ALONE_TIMEOUT";
export type EngineState = "OPENING" | "NEEDS_LOGIN" | "WAITING_ADMISSION" | "LISTENING";

export interface BotEngineStartInput {
  meetingUrl: string;
  platform: BotPlatform;
  botDisplayName: string;
  autoRecord: boolean;
  headless: false;
  /** Ejecutable del navegador elegido en los ajustes (el mismo que usa el login). */
  browserPath: string;
  profileDir: string;
  onStatus: (state: EngineState, message: string) => void;
  onEnded: (reason: Exclude<EndReason, "USER">) => void;
}

export interface BotEngineResult {
  utterances: number;
  deliveryFile: string | null;
}

/** Puerto hacia el bot real; lo implementa desktop/src/botEngine.ts. */
export interface BotEngine {
  /** Entra a la sala; resuelve cuando el bot ya está escuchando. Devuelve el id de sesión del motor. */
  start(input: BotEngineStartInput): Promise<string>;
  finalize(sessionId: string, meetingUrl: string, outputDir: string): Promise<BotEngineResult>;
  /** Cierra el navegador sin generar nada. */
  abort(): Promise<void>;
}

export class BotSessionError extends Error {
  constructor(
    public readonly code: "BUSY" | "URL_NOT_ALLOWED" | "NOT_ACTIVE",
    message: string
  ) {
    super(message);
    this.name = "BotSessionError";
  }
}

export interface BotSessionServiceDeps {
  engine: BotEngine;
  getConfig: () => MeetingBotConfigDto;
  /** Ruta del navegador según la preferencia de los ajustes ('auto', 'brave', 'chrome', 'msedge'). */
  resolveBrowserPath: (preferred: string) => string;
  profileDir: string;
  outputDir: () => string;
  importMeetings: () => ImportBotMeetingsResultDto;
  onEvent?: (session: BotSessionDto, previous: BotSessionState) => void;
  now?: () => Date;
}

const ACTIVE: BotSessionState[] = ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING", "ENDING"];

const END_TEXT: Record<EndReason, string> = {
  USER: "Terminaste la reunión.",
  LEFT_ROOM: "El bot salió de la sala.",
  MEETING_ENDED_TEXT: "La reunión terminó.",
  BROWSER_CLOSED: "Se cerró el navegador del bot.",
  ALONE_TIMEOUT: "El bot se quedó solo en la sala y salió."
};

function idle(): BotSessionDto {
  return { state: "IDLE", message: "El bot no está en ninguna reunión.", meetingUrl: null, platform: null, startedAt: null, error: null, result: null };
}

export class BotSessionService {
  private session: BotSessionDto = idle();
  private engineSessionId: string | null = null;
  private startPromise: Promise<void> = Promise.resolve();
  private finishing: Promise<BotSessionDto> | null = null;
  private cancelled = false;
  private generation = 0;

  constructor(private deps: BotSessionServiceDeps) {}

  public current(): BotSessionDto {
    return { ...this.session };
  }

  public isActive(): boolean {
    return ACTIVE.includes(this.session.state);
  }

  public async join(rawUrl: string): Promise<BotSessionDto> {
    if (this.isActive()) throw new BotSessionError("BUSY", "El bot ya está en una reunión. Termínala antes de entrar a otra.");
    const cfg = this.deps.getConfig();
    const check = checkMeetingUrl(rawUrl, {
      allowedPlatforms: cfg.botAllowedPlatforms ?? [...BOT_PLATFORMS],
      allowedDomains: cfg.botAllowedDomains ?? [...DEFAULT_BOT_ALLOWED_DOMAINS]
    });
    if (!check.ok) throw new BotSessionError("URL_NOT_ALLOWED", check.reason);

    const gen = ++this.generation;
    this.engineSessionId = null;
    this.finishing = null;
    this.cancelled = false;
    this.session = {
      ...idle(),
      state: "IDLE",
      meetingUrl: check.url,
      platform: check.platform,
      startedAt: (this.deps.now ?? (() => new Date()))().toISOString()
    };
    this.setState("OPENING", "Abriendo el navegador…");
    // Se devuelve el snapshot: un motor síncrono puede cambiar el estado antes del return.
    const opening = this.current();
    this.startPromise = this.run(gen, check.url, check.platform, cfg);
    return opening;
  }

  public async leave(): Promise<BotSessionDto> {
    if (!this.isActive()) throw new BotSessionError("NOT_ACTIVE", "El bot no está en ninguna reunión.");
    if (this.engineSessionId === null) {
      // Todavía no entró: se cancela sin generar nada.
      const gen = this.generation;
      this.cancelled = true;
      await this.deps.engine.abort().catch(() => {});
      if (gen !== this.generation) return this.current();
      this.session = {
        ...this.session,
        result: { imported: 0, utterances: 0, deliveryFile: null, reason: "Cancelado antes de entrar." }
      };
      this.setState("ENDED", "Cancelaste la entrada del bot.");
      return this.current();
    }
    return this.finish("USER");
  }

  /** Cierra la sesión activa al apagar la app. */
  public async dispose(): Promise<void> {
    if (this.isActive()) await this.leave().catch(() => {});
  }

  /** La sesión de esta generación ya no es la vigente o fue cancelada. */
  private isStale(gen: number): boolean {
    return gen !== this.generation || this.cancelled;
  }

  /** Cierra el navegador de una ejecución obsoleta, sin tocar el de una sesión nueva en curso. */
  private async abortStale(gen: number): Promise<void> {
    if (gen === this.generation || !this.isActive()) await this.deps.engine.abort().catch(() => {});
  }

  private async run(gen: number, url: string, platform: BotPlatform, cfg: MeetingBotConfigDto): Promise<void> {
    let id: string;
    try {
      id = await this.deps.engine.start({
        meetingUrl: url,
        platform,
        botDisplayName: cfg.botDisplayName,
        autoRecord: cfg.botAutoRecord,
        headless: false,
        browserPath: this.deps.resolveBrowserPath(cfg.botPreferredBrowser),
        profileDir: this.deps.profileDir,
        onStatus: (state, message) => {
          if (gen !== this.generation || this.cancelled || !this.isActive() || this.session.state === "ENDING") return;
          this.setState(state, message);
        },
        onEnded: (reason) => {
          if (gen !== this.generation) return;
          void this.finish(reason);
        }
      });
    } catch (err) {
      if (this.isStale(gen)) {
        await this.abortStale(gen);
        return;
      }
      await this.fail(err, gen, "El bot no pudo completar la entrada: ");
      return;
    }
    if (this.isStale(gen)) {
      // El motor entró a la sala después de cancelar: hay que cerrarlo.
      await this.abortStale(gen);
      return;
    }
    this.engineSessionId = id;
    if (this.session.state !== "LISTENING" && this.isActive() && this.session.state !== "ENDING") {
      this.setState("LISTENING", "El bot está en la reunión y captando la conversación.");
    }
  }

  private finish(reason: EndReason): Promise<BotSessionDto> {
    if (this.finishing) return this.finishing;
    const gen = this.generation;
    this.finishing = (async () => {
      await this.startPromise.catch(() => {});
      if (gen !== this.generation || !this.isActive() || this.engineSessionId === null) return this.current();
      this.setState("ENDING", "Generando la reunión…");
      try {
        const res = await this.deps.engine.finalize(this.engineSessionId, this.session.meetingUrl ?? "", this.deps.outputDir());
        if (gen !== this.generation) return this.current();
        if (reason === "BROWSER_CLOSED" && res.utterances === 0) {
          this.session.error = "El navegador se cerró antes de captar la reunión.";
          this.setState("FAILED", this.session.error);
          return this.current();
        }
        let imported = 0;
        let importFailed = false;
        if (res.deliveryFile) {
          try {
            const r = this.deps.importMeetings();
            const mine = path.basename(res.deliveryFile);
            importFailed = r.folderMissing || r.failed.some((f) => f.file === mine);
            imported = importFailed ? 0 : r.imported;
          } catch {
            importFailed = true;
          }
        }
        this.session.result = { imported, utterances: res.utterances, deliveryFile: res.deliveryFile, reason: END_TEXT[reason] };
        this.setState(
          "ENDED",
          importFailed
            ? `${END_TEXT[reason]} La reunión se generó, pero no se pudo importar a la biblioteca. Usa "Importar reuniones del bot".`
            : res.deliveryFile
              ? `${END_TEXT[reason]} La reunión ya está en tu biblioteca.`
              : `${END_TEXT[reason]} Terminó sin transcripción: no se creó la reunión en la biblioteca.`
        );
      } catch (err) {
        await this.fail(err, gen, "No se pudo generar la reunión: ");
      }
      return this.current();
    })();
    return this.finishing;
  }

  private async fail(err: unknown, gen: number, prefix = ""): Promise<void> {
    if (gen !== this.generation) return;
    const raw = err instanceof Error ? err.message : String(err);
    // Los BotJoinError ya traen un mensaje en español; el resto (puppeteer, fs) llega en inglés.
    const message = err instanceof Error && err.name === "BotJoinError" ? raw : `${prefix}${raw}`;
    await this.deps.engine.abort().catch(() => {});
    // Tras el await pudo haber una cancelación, una sesión nueva o un estado final.
    if (this.isStale(gen) || this.session.state === "ENDED" || this.session.state === "FAILED") return;
    this.session.error = message;
    this.setState("FAILED", message);
  }

  private setState(state: BotSessionState, message: string): void {
    const previous = this.session.state;
    this.session = { ...this.session, state, message };
    this.deps.onEvent?.(this.current(), previous);
  }
}
