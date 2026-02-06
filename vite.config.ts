import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        ws: true,
        onProxyRes: (proxyRes, req, res) => {
          // Ensure Set-Cookie headers are passed through
          const setCookieHeaders = proxyRes.headers["set-cookie"];
          if (setCookieHeaders) {
            // Remove Domain attribute from cookies so they work across origins
            const modifiedCookies = (Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]).map(
              (cookie: string) => {
                // Remove Domain= part if present
                return cookie.replace(/;\s*Domain=[^;]*/i, "");
              }
            );
            proxyRes.headers["set-cookie"] = modifiedCookies;
          }
        },
      },
    },
    hmr: process.env.REPL_ID
      ? {
          host: process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost",
          port: 443,
          protocol: "wss",
        }
      : undefined,
  },
});
