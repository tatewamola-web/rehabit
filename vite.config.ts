import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5273,
    // getUserMedia needs a secure context; localhost counts as one.
    host: 'localhost',
  },
  build: {
    // The MediaPipe bundle is large and cannot be meaningfully split.
    chunkSizeWarningLimit: 1600,
  },
});
