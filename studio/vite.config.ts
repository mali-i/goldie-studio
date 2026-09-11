import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

declare const process: { env: Record<string, string | undefined> };

const SRC_DIR = new URL("./src", import.meta.url).pathname;

/**
 * Standalone development always has a complete demo under public/. A caller
 * can point GOLDIE_WEB_DIR at a generated out/web directory to preview real
 * data without creating a source-code dependency on the Goldie repository.
 */
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": SRC_DIR } },
  publicDir: process.env.GOLDIE_WEB_DIR ?? "public",
  server: { port: 4321, open: true },
}));
