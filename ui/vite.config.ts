import { defineConfig } from "vite";

// During local `npm run dev`, proxy the FHIR API to a server on :8080 so the
// browser stays same-origin (matching the nginx setup used in the container).
export default defineConfig({
  server: {
    proxy: {
      "/fhir": {
        target: process.env.FHIR_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
