import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    https: false,
    port: 3000,
  },
  build: {
    target: 'es2022',
  },
});
