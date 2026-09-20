import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    // Browser development uses the same local Python RPC endpoint as Tauri.
    proxy: { "/rpc": "http://127.0.0.1:5174" },
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  define: {
    // Several deps we don't control (react-draggable's debug logger, bundled
    // into react-rnd) reference the bare Node `process` global at runtime —
    // undefined in the browser/WebView, so `process.env.X` throws a
    // ReferenceError and silently kills the whole event handler (this is
    // what broke floating-window dragging). Replacing `process.env` with an
    // empty object at build time makes every `process.env.*` access resolve
    // to `undefined` instead of throwing.
    "process.env": {},
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
