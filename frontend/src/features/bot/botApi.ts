import { isDesktopApp } from "../../lib/runtime.js";

/** Base de la API del bot: en escritorio vive en /desktop/bot (autenticada); en web, en /bot. */
export function botBase(): string {
  return isDesktopApp() ? "/desktop/bot" : "/bot";
}

/** En web la ruta /bot/status no informa `loginChecked`: el estado de vinculación se considera siempre comprobado. */
export function isLoginChecked(desktop: boolean, statusLoginChecked: boolean | undefined): boolean {
  return desktop ? Boolean(statusLoginChecked) : true;
}
