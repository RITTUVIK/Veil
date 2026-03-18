import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow importing the SDK code from the parent repo.
      allow: [".."],
    },
  },
});

