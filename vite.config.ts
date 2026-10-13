import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('recharts') ||
              id.includes('d3-') ||
              id.includes('victory') ||
              id.includes('@reduxjs/toolkit') ||
              id.includes('immer') ||
              id.includes('react-redux') ||
              id.includes('reselect') ||
              id.includes('decimal.js-light') ||
              id.includes('es-toolkit')
            ) {
              return 'vendor-recharts';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            return 'vendor-misc';
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
