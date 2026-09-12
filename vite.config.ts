import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { workspacePlugin } from "./server/workspace";

declare const process: { env: Record<string, string | undefined> };

const SRC_DIR = new URL("./src", import.meta.url).pathname;
const WORKSPACE_DIR = process.env.GOLDIE_STUDIO_WORKSPACE ?? new URL("./workspace", import.meta.url).pathname;

/** Standalone development always has a complete demo and a local workspace. */
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), workspacePlugin(WORKSPACE_DIR)],
  resolve: { alias: { "@": SRC_DIR } },
  publicDir: "public",
  server: { port: 4321, open: true },
}));
