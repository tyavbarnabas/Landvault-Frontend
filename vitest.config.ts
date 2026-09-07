import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately separate from vite.config.ts rather than reusing it: that
// config wires up Figma Make's dev-server-only plugins (site.json injection,
// the HMR error-overlay replay, the make-kit stories route) that have no
// business running under a test runner. This file keeps just what the money
// logic tests actually need — the "@" alias and a Node environment, since
// this pass deliberately tests pure service/logic functions, not components
// (no jsdom, no React Testing Library).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/services/**", "src/pages/portfolio/Portfolio.tsx"],
    },
  },
});
