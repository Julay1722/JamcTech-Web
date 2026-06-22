import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// JAMC's Tech — build Vite + React.
// Solo index.html + lo que src/ importa termina en dist/ → ningún .md ni
// backup_*/*.json con data del negocio se publica (ver skill jamc-deploy).
export default defineConfig({
  plugins: [react()],
  server: { port: 1722, open: false },
  preview: { port: 1722 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // Solo index.html es entry. Los .html legacy del root no se incluyen.
      input: 'index.html',
      output: {
        // Separa las dependencias (react, supabase) del código de la app para
        // mejor cache: el vendor casi no cambia entre deploys.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
