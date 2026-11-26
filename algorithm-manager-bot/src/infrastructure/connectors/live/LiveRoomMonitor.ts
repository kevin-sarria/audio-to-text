import { BotJoinError } from "../../../domain/models/LiveSession.js";
import {
  END_POLL_MS,
  MeetingEndDetector,
  type EndReason
} from "../../../domain/services/MeetingEndDetector.js";

/** Lo mínimo que el monitor necesita saber de la sala; la implementación real usa puppeteer. */
export interface RoomProbe {
  isBrowserOpen(): boolean;
  currentUrl(): string;
  pageText(): Promise<string>;
  /** null si no se puede leer. */
  participantCount(): Promise<number | null>;
  /** true cuando ya se ve la barra de la llamada (botón de salir). */
  hasAdmittedMarker(): Promise<boolean>;
}

/** Lecturas fallidas seguidas que se toleran antes de dar el navegador por cerrado. */
const MAX_READ_FAILURES = 3;

export interface MonitorClock {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class LiveRoomMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private detector = new MeetingEndDetector();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private generation = 0;
  private checking = false;
  private readFailures = 0;

  constructor(
    private probe: RoomProbe,
    private roomMarker: string,
    clock: MonitorClock = {}
  ) {
    this.now = clock.now ?? (() => Date.now());
    this.sleep = clock.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Espera a que el anfitrión admita al bot. Lanza BotJoinError si no entra. */
  public async waitForAdmission(limitMs: number, rejectedPattern: RegExp, pollMs = 2000): Promise<void> {
    const started = this.now();
    while (true) {
      if (!this.probe.isBrowserOpen()) {
        throw new BotJoinError("ROOM_UNAVAILABLE", "El navegador se cerró antes de que el bot entrara a la sala.");
      }
      if (await this.probe.hasAdmittedMarker().catch(() => false)) return;
      const text = await this.probe.pageText().catch(() => "");
      if (rejectedPattern.test(text)) {
        throw new BotJoinError("ROOM_UNAVAILABLE", "El anfitrión rechazó la solicitud de entrada del bot.");
      }
      if (this.now() - started >= limitMs) {
        throw new BotJoinError(
          "ADMISSION_TIMEOUT",
          "Nadie admitió al bot en la sala a tiempo. Pide al anfitrión que lo admita e inténtalo de nuevo."
        );
      }
      await this.sleep(pollMs);
    }
  }

  /** Una comprobación de fin de reunión. */
  public async checkOnce(): Promise<EndReason | null> {
    if (!this.probe.isBrowserOpen()) return this.detector.evaluate(this.snapshot(false, "", null, false));
    try {
      const [pageText, participantCount, inCall] = await Promise.all([
        this.probe.pageText(),
        this.probe.participantCount(),
        this.probe.hasAdmittedMarker().catch(() => false)
      ]);
      this.readFailures = 0;
      return this.detector.evaluate(this.snapshot(true, pageText, participantCount, inCall));
    } catch {
      // Un error pasajero (p. ej. el contexto de la página se destruye al navegar) no termina la reunión.
      this.readFailures++;
      if (!this.probe.isBrowserOpen() || this.readFailures >= MAX_READ_FAILURES) return "BROWSER_CLOSED";
      return null;
    }
  }

  public startEndWatch(onEnded: (reason: EndReason) => void, pollMs = END_POLL_MS): void {
    this.stop();
    const generation = this.generation;
    this.timer = setInterval(() => {
      if (this.checking) return;
      this.checking = true;
      void this.checkOnce()
        .then((reason) => {
          // Si hubo stop() (o un nuevo startEndWatch) mientras se comprobaba, se descarta el resultado.
          if (!reason || generation !== this.generation) return;
          this.stop();
          onEnded(reason);
        })
        .catch((err) => {
          console.warn("[LiveRoomMonitor] error en la vigilancia de fin de reunión:", err);
        })
        .finally(() => {
          this.checking = false;
        });
    }, pollMs);
  }

  public stop(): void {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private snapshot(browserOpen: boolean, pageText: string, participantCount: number | null, inCall: boolean) {
    return {
      inCall,
      browserOpen,
      urlStillInRoom: this.roomMarker === "" || this.probe.currentUrl().includes(this.roomMarker),
      pageText,
      participantCount,
      nowMs: this.now()
    };
  }
}
