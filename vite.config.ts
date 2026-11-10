import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const contentRoot = path.resolve(appRoot, '../content-public');

// The app fetches content at runtime. In development the sibling content
// repository is served under /data/ so the default base URL works offline.
function contentDevServer(): Plugin {
  return {
    name: 'content-dev-server',
    configureServer(server) {
      server.middlewares.use('/data', (request, response, next) => {
        const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
        const file = path.resolve(contentRoot, `.${pathname}`);

        if (!file.startsWith(`${contentRoot}${path.sep}`)) {
          next();
          return;
        }

        fs.readFile(file, (error, data) => {
          if (error) {
            next();
            return;
          }
          response.setHeader(
            'Content-Type',
            'application/json; charset=utf-8',
          );
          response.end(data);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), contentDevServer()],
  base: process.env.VITE_BASE ?? '/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: false,
  },
});
