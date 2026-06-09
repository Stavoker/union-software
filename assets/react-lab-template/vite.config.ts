import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Absolute base so deep routes (/bonus, /slots) load JS/CSS from /assets/, not /bonus/assets/.
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
