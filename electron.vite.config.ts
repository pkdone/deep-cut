import path from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = {
  '@domain': path.resolve(__dirname, 'src/domain'),
  '@application': path.resolve(__dirname, 'src/application'),
  '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
  '@interfaces': path.resolve(__dirname, 'src/interfaces'),
  '@shared': path.resolve(__dirname, 'src/shared'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/interfaces/electron-main/main.ts'),
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/interfaces/electron-preload/preload.ts'),
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'src/interfaces/app'),
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/interfaces/app/index.html'),
      },
    },
  },
});
