import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@db': path.resolve(__dirname, 'src/db'),
      '@modules': path.resolve(__dirname, 'src/modules'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(path.resolve(__dirname, 'tailwind.config.cjs')),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  root: 'src/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
