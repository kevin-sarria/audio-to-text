// La app NO usa la lista por rol del panel: calcula capacidades a partir del claim "cap" del token.
export function capacidadesDesdeToken(claims: { cap?: string }): string[] {
  return (claims.cap ?? "").split(",").filter(Boolean);
}
