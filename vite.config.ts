import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

import cartographer from "@vitejs/plugin-cartographer";
import devBanner from "@vitejs/plugin-dev-banner";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // runtimeErrorOverlay(), // remove this line
    ...(mode !== "production" ? [cartographer(), devBanner()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
}));
