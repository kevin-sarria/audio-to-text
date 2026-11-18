import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InProcessJobQueue } from "../infrastructure/queue/InProcessJobQueue.js";

describe("InProcessJobQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("concurrencia de transcribe=1 y orden FIFO", async () => {
    const queue = new InProcessJobQueue();
    const executionOrder: string[] = [];
    const activeTasks: number[] = [];
    let currentConcurrent = 0;

    queue.registerHandler("transcribe", async (payload) => {
      currentConcurrent++;
      activeTasks.push(currentConcurrent);
      // Simular tarea que tarda un tiempo
      await new Promise((r) => setTimeout(r, 100));
      executionOrder.push(payload.sessionId);
      currentConcurrent--;
    });

    await queue.enqueueTranscribe({ sessionId: "task-1" });
    await queue.enqueueTranscribe({ sessionId: "task-2" });
    await queue.enqueueTranscribe({ sessionId: "task-3" });

    // Avanzar temporizadores
    await vi.advanceTimersByTimeAsync(500);

    expect(executionOrder).toEqual(["task-1", "task-2", "task-3"]);
    // Concurrencia máxima nunca debió exceder 1
    expect(Math.max(...activeTasks)).toBe(1);

    await queue.close();
  });

  it("3 reintentos con backoff exponencial y onFinalFailure una sola vez", async () => {
    let attempts = 0;
    const finalFailureMock = vi.fn();

    const queue = new InProcessJobQueue({
      onFinalFailure: finalFailureMock
    });

    queue.registerHandler("preprocess", async () => {
      attempts++;
      throw new Error("Fallo temporal de prueba");
    });

    await queue.enqueuePreprocess({ sessionId: "failing-session" });

    // Intento 1 se ejecuta inmediatamente
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toBe(1);
    expect(finalFailureMock).not.toHaveBeenCalled();

    // Backoff intento 2 (2000 ms)
    await vi.advanceTimersByTimeAsync(2000);
    expect(attempts).toBe(2);
    expect(finalFailureMock).not.toHaveBeenCalled();

    // Backoff intento 3 (4000 ms)
    await vi.advanceTimersByTimeAsync(4000);
    expect(attempts).toBe(3);

    // Tras agotar los 3 intentos, se llama a onFinalFailure una sola vez
    expect(finalFailureMock).toHaveBeenCalledTimes(1);
    expect(finalFailureMock).toHaveBeenCalledWith(
      "preprocess",
      expect.objectContaining({ sessionId: "failing-session" }),
      expect.any(Error)
    );

    await queue.close();
  });

  it("idempotencia por sessionId en etapa activa", async () => {
    const queue = new InProcessJobQueue();
    let runs = 0;

    queue.registerHandler("preprocess", async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 1000));
    });

    // Encolar la misma sesión dos veces
    await queue.enqueuePreprocess({ sessionId: "idempotent-session" });
    await queue.enqueuePreprocess({ sessionId: "idempotent-session" });

    await vi.advanceTimersByTimeAsync(1500);

    expect(runs).toBe(1);

    await queue.close();
  });
});
