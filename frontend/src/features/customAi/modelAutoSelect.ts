/**
 * Determina si el selector de modelos LLM debe auto-seleccionar el modelo predeterminado.
 *
 * Contrato:
 * Solo devuelve true si la petición que respondió sigue siendo la más reciente
 * (`requestId === currentRequestId`) y el valor actual en el componente está vacío
 * (`latestValue.trim() === ""`).
 *
 * Nunca reemplaza un valor no vacío (respetando la selección guardada o manual).
 */
export function shouldAutoSelectModel(args: {
  latestValue: string;
  requestId: number;
  currentRequestId: number;
}): boolean {
  return args.requestId === args.currentRequestId && args.latestValue.trim() === "";
}
