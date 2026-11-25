import { vi } from "vitest";
import { HeadlessMeetingBotConnector } from "../../infrastructure/connectors/HeadlessMeetingBotConnector.js";

export function stubConnector(): void {
  vi.spyOn(HeadlessMeetingBotConnector.prototype, "connectToMeeting").mockResolvedValue({
    sessionId: "stub",
    platform: "GOOGLE_MEET",
    connectedAt: new Date().toISOString(),
    status: "CONNECTED_AND_RECORDING",
    message: "stub"
  });
  vi.spyOn(HeadlessMeetingBotConnector.prototype, "leaveMeeting").mockResolvedValue({ success: true });
}
