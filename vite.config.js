import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    // Proxy local para dev: redireciona /api/gas para o GAS diretamente
    proxy: {
      "/api/gas": {
        target: process.env.GAS_URL || "https://script.google.com",
        changeOrigin: true,
        rewrite: () => "",
      },
    },
  },
});
