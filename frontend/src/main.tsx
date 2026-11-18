import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { isDesktopApp } from "./lib/runtime.js";

// Deshabilitar Service Worker explícitamente en entorno de escritorio
if (isDesktopApp() && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
