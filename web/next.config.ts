import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * The Discord bot at the repo root has its own package-lock.json, so Turbopack
 * sees two lockfiles and can't infer which directory is the workspace root.
 * Pinning it here keeps the build deterministic and silences that warning.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
