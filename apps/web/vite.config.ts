import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

// GitHub Pages serves 404.html for any path it does not know. Shipping the app there lets clean URLs
// such as /galeria or /juego/reto/3 load directly, without the old "#" in the address.
const spaFallback = () => {
  let outDir = '';
  return {
    name: 'spa-fallback',
    apply: 'build' as const,
    configResolved(config: { root: string; build: { outDir: string } }) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() { copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html')); },
  };
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), spaFallback()],
  base: mode === 'production' ? '/event-quest/' : '/',
  server: {
    host: '0.0.0.0',
    hmr: { protocol: 'ws', clientPort: 5173 }
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }
}));
