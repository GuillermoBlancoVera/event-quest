import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/event-quest/' : '/',
  server: {
    host: '0.0.0.0',
    hmr: { protocol: 'ws', clientPort: 5173 }
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }
}));
