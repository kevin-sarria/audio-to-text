import type { AvailableModelItem } from "@audio-to-text/shared";

export interface ModelOption {
  id: string;
  label: string;
  secondary?: string;
  missing?: boolean;
}

export function buildModelOptions(models: AvailableModelItem[], value: string): ModelOption[] {
  const options: ModelOption[] = [];
  const seenIds = new Set<string>();

  for (const m of models) {
    if (!m.id || seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    const effectiveName = m.name?.trim();
    const label = effectiveName || m.id;
    const secondary = effectiveName && effectiveName !== m.id ? m.id : undefined;
    options.push({
      id: m.id,
      label,
      ...(secondary ? { secondary } : {})
    });
  }

  const trimmedVal = value ? value.trim() : "";
  if (trimmedVal && !seenIds.has(trimmedVal)) {
    options.push({
      id: trimmedVal,
      label: `${trimmedVal} (no está en la lista del proveedor)`,
      missing: true
    });
  }

  return options;
}
