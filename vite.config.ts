import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: false,
  },
});
