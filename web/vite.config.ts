import fs from 'node:fs';
import path from 'node:path';
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

// Builds the API reference at <base>/api-docs/: the server's OpenAPI document
// rendered with Swagger UI, bundled locally so it also works on the static demo
// (where "Try it out" is off, since there is no server to call).
function apiDocs(): Plugin {
  const swagger = path.dirname(require.resolve('swagger-ui-dist/package.json'));
  const demo = process.env.VITE_DEMO === 'true';
  const files: Record<string, () => string | Buffer> = {
    'index.html': () => fs.readFileSync(path.join(__dirname, 'api-docs.html'), 'utf8')
      .replace('__SUBMIT_METHODS__', demo ? '[]' : "['get', 'post', 'put', 'patch', 'delete']")
      .replace('<!--DEMO_NOTE-->', demo
        ? '<p class="note">This is the static demo, so requests cannot be sent from this page. Run the server (<code>npm start</code>) to try the API at <code>/api-docs/</code>.</p>'
        : ''),
    'openapi.json': () => {
      delete require.cache[require.resolve('../server/openapi')];
      return JSON.stringify(require('../server/openapi').spec, null, 2);
    },
    'swagger-ui-bundle.js': () => fs.readFileSync(path.join(swagger, 'swagger-ui-bundle.js')),
    'swagger-ui.css': () => fs.readFileSync(path.join(swagger, 'swagger-ui.css')),
  };
  const types: Record<string, string> = { html: 'text/html', json: 'application/json', js: 'text/javascript', css: 'text/css' };
  return {
    name: 'migrator-api-docs',
    configureServer(server) {
      server.middlewares.use(`${server.config.base}api-docs`, (req, res, next) => {
        const name = (req.url || '/').split('?')[0].replace(/^\//, '') || 'index.html';
        if (!files[name]) return next();
        res.setHeader('Content-Type', types[name.split('.').pop()!]);
        res.end(files[name]());
      });
    },
    generateBundle() {
      for (const [name, read] of Object.entries(files)) this.emitFile({ type: 'asset', fileName: `api-docs/${name}`, source: read() });
    },
  };
}

export default defineConfig({
  root: __dirname,
  // GitHub Pages serves the demo from /<repo>/; set VITE_BASE for that build.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss(), migratorMeta(), apiDocs()],
  build: { outDir: process.env.VITE_OUT_DIR || 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
