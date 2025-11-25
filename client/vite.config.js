import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: ['localhost', 'egeli-kutuphane-2024.loca.lt', '.loca.lt']
  }
});
