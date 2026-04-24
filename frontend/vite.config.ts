import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: {
    VITE_BASE_PATH?: string;
  };
};

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  envDir: "..",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
