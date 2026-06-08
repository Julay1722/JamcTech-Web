import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// JAMC's Tech — build Vite + React.
// Solo index.html + lo que src/ importa termina en dist/ → ningún .md ni
// backup_*/*.json con data del negocio se publica (ver skill jamc-deploy).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Solo index.html es entry. Los .html legacy del root no se incluyen.
    rollupOptions: { input: 'index.html' },
  },
});
