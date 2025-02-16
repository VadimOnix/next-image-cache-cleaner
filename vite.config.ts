/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { coverageConfigDefaults } from 'vitest/config'

import packageJson from './package.json'

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs'],
    },
    outDir: 'dist',
    rollupOptions: {
      external: [
        'child_process',
        'chokidar',
        'crypto',
        'events',
        'fs',
        'fs/promises',
        'node:child_process',
        'node:events',
        'node:fs',
        'node:fs/promises',
        'node:path',
        'node:process',
        'os',
        'path',
        'pino',
        'pino-pretty',
      ],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
    target: 'node22',
    minify: false,
  },
  define: {
    __VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    coverage: {
      enabled: true,
      exclude: ['./*.js', './dist', ...coverageConfigDefaults.exclude],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
