import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // 监听 0.0.0.0，允许局域网访问
    port: 5173,
  },
  define: {
    // ethers.js v6 uses globalThis, but some builds need this
    global: "globalThis",
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
