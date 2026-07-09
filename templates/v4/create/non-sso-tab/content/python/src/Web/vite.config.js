import fs from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/tabs/test",
  esbuild: {
    tsconfigRaw: fs.readFileSync("./tsconfig.json"),
  },
});
