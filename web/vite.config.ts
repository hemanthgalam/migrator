import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);

// Exposes the server's connector and transform catalog to the browser demo,
// so the static build describes exactly what the real API does.
function migratorMeta(): Plugin {
  const id = 'virtual:migrator-meta';
  return {
    name: 'migrator-meta',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      const { describeConnectors } = require('../server/connectors');
      const t = require('../server/engine/transforms');
      const meta = {
        connectors: describeConnectors(),
        transforms: { types: t.STEP_TYPES, filterOps: t.FILTER_OPS, castTypes: t.CAST_TYPES, formatFns: t.FORMAT_FNS, maskStrategies: t.MASK_STRATEGIES },
      };
      return `export default ${JSON.stringify(meta)};`;
    },
  };
}

export default defineConfig({
  root: __dirname,
  // GitHub Pages serves the demo from /<repo>/; set VITE_BASE for that build.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss(), migratorMeta()],
  build: { outDir: process.env.VITE_OUT_DIR || 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
