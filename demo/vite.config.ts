import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force all imports of "ethers" (including those from ../src/**) to resolve
      // from demo/node_modules so Vercel's build (which only installs demo deps) works.
      "ethers": path.resolve(__dirname, "node_modules/ethers"),
    },
  },
  server: {
    fs: {
      // Allow importing the SDK code from the parent repo.
      allow: [".."],
    },
  },
});
