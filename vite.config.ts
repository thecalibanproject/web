/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The built console is served by the Rust control plane from `/` (port 8081).
// `base: './'` makes every asset URL relative, so the same `dist/` also works
// behind a reverse proxy under a sub-path. Client routing uses hash history
// (`#/tenants`), so the static server never needs an SPA fallback rule.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.CALIBAN_DEV_API_TARGET ?? 'http://localhost:8081';

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        // Single sign-on endpoints. For SSO in development, register
        // http://localhost:5173/auth/callback as the redirect URL so the
        // session cookie is set on the dev server's origin.
        '/auth': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Off by default: dist/ is embedded/served by the control plane. CALIBAN_SOURCEMAP=true to enable.
      sourcemap: env.CALIBAN_SOURCEMAP === 'true',
      // Keep everything as files in dist/; nothing is fetched at runtime.
      assetsInlineLimit: 4096,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  };
});
