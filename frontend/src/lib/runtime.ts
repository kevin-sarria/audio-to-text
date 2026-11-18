export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  appVersion: string;
  openDataFolder: () => Promise<void>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktop?.isDesktop);
}

export function getDesktopPlatform(): string | null {
  return typeof window !== "undefined" ? window.desktop?.platform ?? null : null;
}
