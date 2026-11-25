export interface HistoryFilters {
  source: "ALL" | "AUDIO" | "BOT";
  /** yyyy-mm-dd (día local) o "" */
  from: string;
  to: string;
  participant: string;
  folderId: string;
}

export const EMPTY_FILTERS: HistoryFilters = { source: "ALL", from: "", to: "", participant: "", folderId: "" };

export function hasActiveFilters(f: HistoryFilters): boolean {
  return f.source !== "ALL" || Boolean(f.from || f.to || f.participant || f.folderId);
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayToInstant(day: string, endOfDay: boolean): string | undefined {
  const m = DAY.exec(day);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = endOfDay ? new Date(y, mo - 1, d, 23, 59, 59, 999) : new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Parámetros de `GET /desktop/library/sessions`: solo los filtros con valor. Los días locales pasan a instantes ISO. */
export function buildLibraryParams(
  filters: HistoryFilters,
  query: string | undefined,
  page: number,
  limit: number
): Record<string, string | number> {
  const params: Record<string, string | number> = { page, limit };
  if (query) params["q"] = query;
  if (filters.source !== "ALL") params["source"] = filters.source;
  const from = dayToInstant(filters.from, false);
  const to = dayToInstant(filters.to, true);
  if (from) params["from"] = from;
  if (to) params["to"] = to;
  if (filters.participant) params["participant"] = filters.participant;
  if (filters.folderId) params["folderId"] = filters.folderId;
  return params;
}
