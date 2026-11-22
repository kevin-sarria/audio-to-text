import type { CustomAiProviderDto } from "@audio-to-text/shared";

export interface FolderFormState {
  name: string;
  description: string;
  technicalContext: string;
  defaultProvider: string;
  defaultModel: string;
  customApiKey: string;
  profileId: string;
}

/**
 * Construye el payload a enviar para la creación o edición de una carpeta de proyecto.
 *
 * Reglas:
 * - Todo se sanea con `trim()`.
 * - `name` y `technicalContext` se envían siempre.
 * - En edición (`isEdit = true`), `description`, `defaultProvider`, `defaultModel` y `profileId`
 *   se envían incluso si están vacíos (`""`) para poder vaciarlos en el backend.
 * - En creación (`isEdit = false`), cualquier campo vacío se envía como `undefined`.
 * - `customApiKey` vacío siempre se traduce en `undefined` (vacío significa «conservar la guardada»);
 *   nunca se envía una versión enmascarada.
 */
export function buildFolderPayload(
  form: FolderFormState,
  isEdit: boolean
): Record<string, string | undefined> {
  const name = form.name.trim();
  const technicalContext = form.technicalContext.trim();

  const trimmedDescription = form.description.trim();
  const trimmedProvider = form.defaultProvider.trim();
  const trimmedModel = form.defaultModel.trim();
  const trimmedProfileId = form.profileId.trim();
  const trimmedApiKey = form.customApiKey.trim();

  const payload: Record<string, string | undefined> = {
    name,
    technicalContext
  };

  if (isEdit) {
    payload.description = trimmedDescription;
    payload.defaultProvider = trimmedProvider;
    payload.defaultModel = trimmedModel;
    payload.profileId = trimmedProfileId;
  } else {
    payload.description = trimmedDescription || undefined;
    payload.defaultProvider = trimmedProvider || undefined;
    payload.defaultModel = trimmedModel || undefined;
    payload.profileId = trimmedProfileId || undefined;
  }

  // customApiKey vacío -> undefined siempre
  payload.customApiKey = trimmedApiKey || undefined;

  return payload;
}

/**
 * Devuelve la etiqueta legible de un proveedor de IA para la interfaz de usuario.
 */
export function providerLabel(
  provider: string,
  customProviders: CustomAiProviderDto[] = []
): string {
  if (provider === "google-account") return "Cuenta de Google (Antigravity)";
  if (provider === "gemini") return "Google Gemini API";
  if (provider === "groq") return "Groq";
  if (provider === "openai") return "OpenAI";
  const matched = customProviders.find((p) => p.id === provider);
  if (matched?.name) return matched.name;
  return provider;
}
