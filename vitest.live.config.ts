import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

// Livetests draaien tegen de live Supabase (er is geen lokale stack; het
// basisschema bestaat alleen live). Ze maken eigen testrijen aan en ruimen
// die op. Bewust NIET in `npm test` — draai expliciet: npm run test:live
export default defineConfig(({ mode }) => ({
  test: {
    include: ["src/**/*.livetest.ts"],
    environment: "node",
    env: loadEnv(mode, __dirname, ""),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
}));
