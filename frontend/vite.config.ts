import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (["react", "react-dom", "react-router-dom"].some((p) => id.includes(`/${p}/`))) return "vendor-react";
            if (id.includes("/recharts/")) return "vendor-recharts";
            if (id.includes("/zustand/") || id.includes("/axios/")) return "vendor-state";
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  preview: {
    port: 4174,
  },
});
