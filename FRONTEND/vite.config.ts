import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const backendTarget = `http://127.0.0.1:${process.env['DANFE_DEV_PORT'] || '3001'}`;

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': backendTarget,
      '/arquivos': backendTarget,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
