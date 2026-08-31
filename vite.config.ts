import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import pkg from './package.json';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const webBuild = process.env.ERD_WEB_BUILD === '1';
  const allowedHosts = new Set<string>();
  for (const value of [env.MCP_PUBLIC_URL, ...(env.CORS_ORIGINS || '').split(',')]) {
    if (!value) continue;
    try { allowedHosts.add(new URL(value).hostname); } catch { /* ignore invalid optional URLs */ }
  }
  return {
    plugins: [react(), tailwindcss()],
    base: '/',
    define: {
      'global': 'window',
      'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Desktop packaging still needs one bundle. The self-hosted web image is
      // allowed to split vendor code, which keeps Rollup below the host's
      // BuildKit memory limit and makes web-only deploys reliable.
      chunkSizeWarningLimit: 10000,
      rollupOptions: {
        output: {
          manualChunks: webBuild ? {
            react: ['react', 'react-dom', '@xyflow/react'],
          } : () => 'app',
        },
      },
    },
    server: {
      port: 5173,
      allowedHosts: [...allowedHosts],
      proxy: {
        '/api': {
          target: process.env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
