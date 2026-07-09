import react from "@vitejs/plugin-react";
import fs from "fs";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/tabs/home",
  esbuild: {
    tsconfigRaw: fs.readFileSync("./tsconfig.app.json"),
  },
});
