import React from "react";

/** true si alguna clave de reinicio cambió entre dos renders (p. ej. el usuario navegó a otra pantalla). */
export function haveResetKeysChanged(prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined): boolean {
  const a = prev ?? [];
  const b = next ?? [];
  if (a.length !== b.length) return true;
  return a.some((value, index) => !Object.is(value, b[index]));
}

interface ErrorFallbackProps {
  error: Error;
  onRetry?: () => void;
  onReload: () => void;
}

/**
 * Pantalla de error sin dependencias del tema ni de MUI: tiene que poder dibujarse aunque el fallo
 * venga justamente del tema o de un componente de la interfaz. Usa `currentColor` para verse bien en claro y oscuro.
 */
export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onRetry, onReload }) => {
  const buttonStyle: React.CSSProperties = {
    font: "inherit",
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid currentColor",
    background: "transparent",
    color: "inherit",
    cursor: "pointer"
  };

  return (
    <div role="alert" style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px", fontFamily: "inherit" }}>
      <h2 style={{ marginTop: 0 }}>Algo salió mal en esta pantalla</h2>
      <p>
        La aplicación encontró un error inesperado al mostrar esta sección. Tus datos no se han perdido: puedes
        reintentar o recargar la aplicación.
      </p>
      <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
        {onRetry && (
          <button type="button" style={buttonStyle} onClick={onRetry}>
            Reintentar
          </button>
        )}
        <button type="button" style={buttonStyle} onClick={onReload}>
          Recargar la aplicación
        </button>
      </div>
      <details>
        <summary style={{ cursor: "pointer" }}>Detalles técnicos</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", opacity: 0.8, fontSize: 13 }}>
          {error.message || String(error)}
        </pre>
      </details>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Cuando cambia alguna de estas claves, el error se descarta y se vuelve a intentar (p. ej. al navegar). */
  resetKeys?: readonly unknown[];
  /** Permite mostrar el botón "Reintentar" (en el nivel de pantalla; no tiene sentido en el nivel raíz). */
  allowRetry?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Error de renderizado:", error, info.componentStack);
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && haveResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): React.ReactNode {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.props.allowRetry ? this.handleRetry : undefined}
          onReload={this.handleReload}
        />
      );
    }
    return this.props.children;
  }
}
