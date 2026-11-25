import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary, ErrorFallback, haveResetKeysChanged } from "../components/ErrorBoundary.js";

describe("ErrorBoundary", () => {
  it("getDerivedStateFromError conserva el Error y envuelve valores que no lo son", () => {
    const err = new Error("boom");
    expect(ErrorBoundary.getDerivedStateFromError(err).error).toBe(err);

    const wrapped = ErrorBoundary.getDerivedStateFromError("texto suelto").error;
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped?.message).toBe("texto suelto");
  });

  it("sin error renderiza a sus hijos tal cual", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundary, null, React.createElement("p", null, "contenido normal"))
    );
    expect(html).toBe("<p>contenido normal</p>");
  });

  it("la pantalla de error muestra el mensaje técnico y ofrece recargar", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorFallback, {
        error: new Error("Cannot read properties of undefined (reading 'length')"),
        onReload: () => {}
      })
    );
    expect(html).toContain("Algo salió mal en esta pantalla");
    expect(html).toContain("Cannot read properties of undefined");
    expect(html).toContain("Recargar la aplicación");
    expect(html).not.toContain("Reintentar");
  });

  it("el botón Reintentar solo aparece cuando se entrega onRetry", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorFallback, { error: new Error("x"), onRetry: () => {}, onReload: () => {} })
    );
    expect(html).toContain("Reintentar");
    expect(html).toContain("Recargar la aplicación");
  });

  it("haveResetKeysChanged detecta cambios, longitudes distintas y ausencia de claves", () => {
    expect(haveResetKeysChanged(["history", null], ["history", null])).toBe(false);
    expect(haveResetKeysChanged(["history", null], ["session", "s1"])).toBe(true);
    expect(haveResetKeysChanged(["a"], ["a", "b"])).toBe(true);
    expect(haveResetKeysChanged(undefined, undefined)).toBe(false);
    expect(haveResetKeysChanged(undefined, ["a"])).toBe(true);
  });
});
