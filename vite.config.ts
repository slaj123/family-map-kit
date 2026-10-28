import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev:phone` serves over HTTPS on your Wi-Fi so the phone gets mic + location access.
const phone = process.argv.includes("--host");

export default defineConfig({
  plugins: [react(), cloudflare(), ...(phone ? [basicSsl()] : [])],
  optimizeDeps: { exclude: ["maplibre-gl"] },
  worker: { format: "es" },
});
