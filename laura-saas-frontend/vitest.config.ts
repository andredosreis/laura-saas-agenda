/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vitest config — alinhado com vite.config.ts mas isolado para tests.
 * Não importa de vite.config.ts porque esse tem PWA plugin que polui ambiente de teste.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Define VITE_API_URL for tests — MSW handlers usam */api/* para match
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: false, // não processar CSS em testes (mais rápido, evita PostCSS issues)
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}', 'tests/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      'tests/e2e/**', // E2E corre via Playwright separadamente
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
    // Reset module registry entre testes para evitar state leakage
    clearMocks: true,
    restoreMocks: true,
  },
});
