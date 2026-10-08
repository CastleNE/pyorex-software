import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import EngineGate from "./components/app/EngineGate";
import "./styles/globals.css";
import { applyThemeToDocument, readPersistedTheme } from "./stores/theme-store";

// Apply the saved theme before the first paint (no dark→light flash).
applyThemeToDocument(readPersistedTheme(typeof localStorage === "undefined" ? undefined : localStorage));

// Suppress browser right-click context menu — this is a desktop app, not a webpage
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EngineGate>
      <App />
    </EngineGate>
  </React.StrictMode>
);
